// renderer
var $CommentQueue = [];

// したらばへの投稿間隔。msec。
var $PostInterval = 10*1000;

var $Stats = { received: 0, sent: 0, errored: 0, filtered: 0 };
var $ThreadInfo = null;
var $DequeueTimeoutId = null;
var $Manager = null;
const VERSION_STRING = "0.2.0";

function showAboutDialog() {
  alert("ニココメ！てんさいくん ver " + VERSION_STRING + "\n" +
        "使用ライブラリ:\n" +
        "iconv-lite, jquery, nicolive-api\n");
}

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

function isAnonymous(comment) {
  return comment.attr.anonymity === "1";
}

function getNickname(id) {
  return new Promise(function(resolve, _reject) {
    $.get(`http://seiga.nicovideo.jp/api/user/info?id=${id}`)
      .done(function(data, textStatus, jqXHR) {
        var result = document.evaluate("/response/user/nickname",
                                       data, // context
                                       null, // namespace resolver,
                                       XPathResult.STRING_TYPE, // return type
                                       null);
        if (result.stringValue) {
          resolve(result.stringValue);
        } else {
          // ユーザーIDをユーザー名として継続。
          console.warn("エラー: XML文書の /response/user/nickname が空です。");
          resolve(""+id);
        }
      })
      .fail(function(jqXHR, textStatus, errorThrown) {
        // ユーザーIDをユーザー名として継続。
        console.warn(`ニコ動ユーザーID ${id} の名前の取得に失敗しました。`, errorThrown);
        resolve(""+id);
      });
  });
}

async function formatComment(c) {
  if (isAnonymous(c) || !$('#nickname-checkbox').prop('checked')) {
    return c.text;
  } else {
    return `＠${await getNickname(c.attr.user_id)}\n` + c.text;
  }
}

// $CommentQueue からコメントを取り出してしたらばに投稿する。
function dequeueCommentAndPost() {
  $DequeueTimeoutId = null;

  var comments = [];

  while (true) {
    if ($CommentQueue.length > 0) {
      var comment = $CommentQueue.shift();

      // コマンドコメントをとばす。
      if (comment.text.match(/^\//)) {
        console.log("filetered (command)", comment);
        $Stats.filtered += 1;
        notifyStatsUpdate();
        continue;
      } else {
        comments.push(comment);
      }
    } else {
      break;
    }
  }

  if (comments.length > 0) {
    Promise.all(comments.map(formatComment)).then(messages => {
      var body = messages.join("\n\n");

      postMessage(makeRes(body), function() { // and then ...
        notifyQueueUpdate();
        $DequeueTimeoutId = setTimeout(dequeueCommentAndPost, $PostInterval);
      });
    });
  } else {
    notifyQueueUpdate();
    $DequeueTimeoutId = setTimeout(dequeueCommentAndPost, $PostInterval);
  }
}

function restoreSettings() {
  // テキスト
  for (var name of ['email', 'password', 'broadcast-id', 'url']) {
    var value = window.localStorage.getItem(name);
    if (value !== null) {
      $('#' + name + '-input').val(value);
    }
  }
  // チェックボックス
  for (var name of ['nickname']) {
    var value = window.localStorage.getItem(name);
    if (value !== null && value !== "false") {
      $('#' + name + '-checkbox').prop('checked', true);;
    }
  }
}

function saveSettings() {
  // テキスト
  for (var name of ['email', 'password', 'broadcast-id', 'url']) {
    var value = $('#' + name + '-input').val();
    window.localStorage.setItem(name, value);
  }
  // チェックボックス
  for (var name of ['nickname']) {
    var value = $('#' + name + '-checkbox').prop('checked');
    window.localStorage.setItem(name, ""+value);
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
  setThreadTitle("");
}

function setLiveName(name) {
  $('#live-name').text(name);
}

function setRoomName(name) {
  $('#room-name').text(name);
}

function setThreadTitle(name) {
  $('#shitaraba-thread-title').text(name);
}

function postResult(responseBody) {
  if (responseBody.match(/2ch_X:error/)) {
    if (responseBody.match(/多重書き込みです/)) {
      return "ratelimit";
    } else {
      return "error";
    }
  } else if (responseBody.match(/書きこみました/)) {
    return "success";
  } else {
    return "unknown";
  }
}

function setLoginInfoVisibility(visible) {
  if (visible) {
    $('#login-info').show();
    $('#hide-button').text("隠す");
  } else {
    $('#login-info').hide();
    $('#hide-button').text("表示");
  }
}

$(function(){
  restoreSettings();
  $('#hide-button').on('click', function(){
    if ($('#hide-button').text() == "隠す") {
      setLoginInfoVisibility(false);
    } else {
      if (confirm("ニコニコ動画のログイン情報を表示します。")) {
        setLoginInfoVisibility(true);
      }
    }
  });
  setLoginInfoVisibility($("#email-input").val()==="");
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

      getThreadTitle($ThreadInfo, function() {
        $DequeueTimeoutId = setTimeout(dequeueCommentAndPost, $PostInterval);
        setStatus("動作中");
        saveSettings();
      });
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

function htmlEscape(ch) {
  return iconv.encode("&#" + ch.codePointAt(0) + ";", "ascii");
}

// String -> Buffer
// JS文字列をEUC-JPでエンコードしてBufferで返す。
// ブラウザがやるような、EUC-JPで表現不可能な文字のエスケープも行う。
function euc_jp(str) {
  var chars = Array.from(str);
  var list = [];
  for (var ch of chars) {
    if (ch.length === 2) {
      list.push(htmlEscape(ch));
    } else {
      var b = iconv.encode(ch, "euc-jp");
      if (b.length === 3) {
        list.push(htmlEscape(ch));
      } else if (b.length === 2) {
        list.push(b);
      } else if (b.length === 1) {
        if (b[0] === 0x3f && ch !== '?') {
          list.push(htmlEscape(ch));
        } else {
          list.push(b);
        }
      } else { throw new Error(); }
    }
  }
  return Buffer.concat(list);
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
      'User-Agent': 'tensaikun/' + VERSION_STRING,
    }
  };

  var post_req = http.request(post_options, function(res) {
    var chunks = [];
    res.setEncoding('binary');
    res.on('data', function (chunk) {
      chunks.push(new Buffer(chunk, 'binary'));
    });
    res.on('end', function() {
      var response_body = iconv.decode(Buffer.concat(chunks), "euc-jp");
      console.log(response_body);

      var result = postResult(response_body)
      if (result === "success") {
        $Stats.sent += 1;
      } else if (result === "error") {
        $Stats.errored += 1;
      } else if (result === "ratelimit") {
        // リトライ
        console.log("retrying ...");
        setTimeout(function() { postMessage(data, cont); }, $PostInterval);
        return;
      } else {
        console.log("Weird result (counting as error): " + result);
        $Stats.errored += 1;
      }
      notifyStatsUpdate();
      cont();
    });
  });

  post_req.on('error', function(e) {
    alert('投稿に失敗:' + e.message);
    onError();
  });

  post_req.write(post_data);
  post_req.end();
}

function getThreadTitle(data, cont) {
  var options = {
    host: 'jbbs.shitaraba.net',
    port: '80',
    path: `/bbs/rawmode.cgi/${data.DIR}/${data.BBS}/${data.KEY}/1`,
    method: 'GET',
    headers: {
      'User-Agent': 'tensaikun/' + VERSION_STRING,
    }
  };

  var req = http.request(options, function(res){
    var chunks = [];
    res.setEncoding('binary');
    res.on('data', function(chunk){
      chunks.push(new Buffer(chunk, 'binary'));
    });
    res.on('end', function(){
      var body = iconv.decode(Buffer.concat(chunks), "euc-jp");
      var title = body.split('<>')[5];
      setThreadTitle(title);
      cont();
    });
  });

  req.end();
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
        if (comment.room.label === manager.viewer.room.label) {
          $CommentQueue.push(comment);
          notifyQueueUpdate();

          $Stats.received += 1;
          notifyStatsUpdate();
          console.log("received", comment)
        } else {
          console.log("discarded (different room)", comment)
        }
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
