// renderer
var $CommentQueue = [];

// したらばへの投稿間隔。msec。
var $PostInterval = 10*1000;

var $Stats = { received: 0, sent: 0, errored: 0, filtered: 0 };
var $ThreadInfo = null;
var $DequeueTimeoutId = null;
var $Manager = null;

function notifyQueueUpdate() {
  $('#queue-length').text(""+$CommentQueue.length);
}

function notifyStatsUpdate() {
  $('#stats-received').text(""+$Stats.received);
  $('#stats-sent').text(""+$Stats.sent);
  $('#stats-errored').text(""+$Stats.errored);
  $('#stats-filtered').text(""+$Stats.filtered);
}

function makeRes(body) {
  if (!$ThreadInfo)
    throw Error("スレッド情報が無い！");

  return Object.assign({ NAME: "てんさいくん", MAIL: "sage", MESSAGE: body},
                       $ThreadInfo)
}

function setStatus(message) {
  $('#status-message').text(message);
}
function setThreadInfo(url) {
  result = url.match(/^https?:\/\/jbbs\.shitaraba\.net\/bbs\/read\.cgi\/(\w+)\/(\d+)\/(\d+)/);
  if (result) {
    $ThreadInfo = { DIR: result[1], BBS: result[2], KEY: result[3] };
  } else {
    throw new Error("スレッドのURLが変です。");
  }
}

// $CommentQueue からコメントを取り出してしたらばに投稿する。
function dequeueCommentAndPost() {
  $DequeueTimeoutId = null;

  var messages = [];

  while (true) {
    if ($CommentQueue.length > 0) {
      var comment = $CommentQueue.shift();

      // コマンドコメントをとばす。
      if (comment.text.match(/^\//)) {
        $Stats.filtered += 1;
        notifyStatsUpdate();
        continue;
      } else {
        messages.push(comment.text);
      }
    } else {
      break;
    }
  }

  if (messages.length > 0) {
    var body;

    if (messages.length === 1) {
      body = messages[0];
    } else {
      var total = messages.length;
      body = "";
      for (var i = 0; i < messages.length; i++) {
        //body += `[${i+1}/${total}] ${messages[i]}\n\n`;
        body += `${messages[i]}\n\n`;
      }
    }

    postMessage(makeRes(body), function() { // and then ...
      notifyQueueUpdate();
      $DequeueTimeoutId = setTimeout(dequeueCommentAndPost, $PostInterval);
    });
  } else {
    $DequeueTimeoutId = setTimeout(dequeueCommentAndPost, $PostInterval);
  }
}

function restoreSettings() {
  for (var name of ['email', 'password', 'broadcast-id', 'url']) {
    var value = window.localStorage.getItem(name);
    if (value !== null) {
      $('#' + name + '-input').val(value);
    }
  }
}

function saveSettings() {
  for (var name of ['email', 'password', 'broadcast-id', 'url']) {
    var value = $('#' + name + '-input').val();
    window.localStorage.setItem(name, value);
  }
}

function onError() {
  if ($DequeueTimeoutId) {
    clearTimeout($DequeueTimeoutId);
    $DequeueTimeoutId = null;
  }

  // コメントサーバーと切断。
  if ($Manager) {
    $Manager.disconnect();
    $Manager = null;
  }

  setStatus("停止中");
  $('#start-button').prop('disabled', false);
  $('#stop-button').prop('disabled', true)
  setLiveName("");
  setRoomName("");
}

function setLiveName(name) {
  $('#live-name').text(name);
}

function setRoomName(name) {
  $('#room-name').text(name);
}

function postResult(responseBody) {
  if (responseBody.match(/2ch_X:error/)) {
    return "error";
  } else if (responseBody.match(/書きこみました/)) {
    return "success";
  } else {
    return "unknown";
  }
}

$(function(){
  restoreSettings();
  setStatus("停止中");
  notifyQueueUpdate();
  notifyStatsUpdate();
  $('#start-button').prop('disabled', false);
  $('#stop-button').prop('disabled', true)
    .on('click', function() { onError(); });
  $('#start-button').on('click', function(e){
    try {
      if ($('#email-input').val()==="")
        throw new Error("EMailが必要です。");
      if ($('#password-input').val()==="")
        throw new Error("パスワードが必要です。");
      if ($('#broadcast-id-input').val()==="")
        throw new Error("転載元の放送IDが必要です。");
      if ($('#url-input').val()==="")
        throw new Error("したらばスレッドのURLが必要です。");

      setThreadInfo($('#url-input').val());
      startListening($('#email-input').val(),
                     $('#password-input').val(),
                     $('#broadcast-id-input').val());
      $('#start-button').prop('disabled', true);
      $('#stop-button').prop('disabled', false);

      $DequeueTimeoutId = setTimeout(dequeueCommentAndPost, $PostInterval);
      setStatus("動作中");
      saveSettings();
    } catch (e) {
      alert("エラー: " + e.message);
      onError();
    }
  });
});

// --------------------------------------------------------------------------
const querystring = require('querystring');
var http = require('http');
var fs = require('fs');
const iconv = require('iconv-lite');

// String -> Buffer
function euc_jp(string) {
  return iconv.encode(string, "euc-jp");
}

function esc(buffer) {
  var str = "";
  for (var i = 0; i < buffer.length; i ++) {
    var hex = buffer[i].toString(16).toUpperCase()
    if (hex.length == 1)
      hex = "0" + hex;
    str += "%" + hex;
  }
  return str;
}

// contは継続。
function postMessage(data, cont) {
  var post_data = querystring.stringify({
    BBS: data.BBS,
    KEY: data.KEY,
    DIR: data.DIR,
  });
  post_data += "&NAME=" + esc(euc_jp(data.NAME));
  post_data += "&MAIL=" + esc(euc_jp(data.MAIL));
  post_data += "&MESSAGE=" + esc(euc_jp(data.MESSAGE));

  var post_options = {
    host: 'jbbs.shitaraba.net',
    port: '80',
    path: `/bbs/write.cgi/${data.DIR}/${data.BBS}/${data.KEY}/`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(post_data),
      'Referer': `http://jbbs.shitaraba.net/bbs/read.cgi/${data.DIR}/${data.BBS}/${data.KEY}/`,
    }
  };

  var post_req = http.request(post_options, function(res) {
    var chunks = [];
    res.setEncoding('binary');
    res.on('data', function (chunk) {
      chunks.push(new Buffer(chunk, 'binary'));
    });
    res.on('end', function() {
      response_body = iconv.decode(Buffer.concat(chunks), "euc-jp");
      var result = postResult(response_body)
      if (result === "success") {
        $Stats.sent += 1;
      } else if (result === "error") {
        $Stats.errored += 1;
      } else {
        console.log("Weird result (counting as error): " + result);
        $Stats.errored += 1;
      }
      notifyStatsUpdate();
      console.log(response_body);
      cont();
    });
  });

  post_req.write(post_data);
  post_req.end();
}

// -----------------------------------------------------------------------------

const nicolive = require("nicolive-api");

function startListening(user, password, video) {
  nicolive.default.login({email: user, password: password}).then(client => {
    client.connectLive(video).then(manager => {
      $Manager = manager;
      setLiveName(manager.live.title);
      setRoomName(manager.viewer.room.label);

      manager.viewer.connection.on('comment', (comment => {
        $CommentQueue.push(comment);
        notifyQueueUpdate();

        $Stats.received += 1;
        notifyStatsUpdate();

        console.log("received", comment)
      }));
      manager.viewer.connection.on('ejected', () => {
        alert('追い出されました');
        onError();
        manager.disconnect();
      });
    }).catch(err => {
      console.log(err);
      alert("放送 " + video + " のコメントストリームに接続できませんでした。\n(終了した放送？)");
      onError();
    });

    client.connectAlert().then(viewer => {
      viewer.connection.on('handshaked', () => {
        console.log('handshaked');
      });
      viewer.connection.on('notify', (info => {
        console.log(info.contentId);
      }));
    });
  }).catch(err => {
    // ログインエラー
    alert(err);
    onError();
  });
}
