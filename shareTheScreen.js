// create Agora client
var client = AgoraRTC.createClient({
  mode: "live",
  codec: "vp8",
});

AgoraRTC.setLogLevel(0);
AgoraRTC.enableLogUpload();

var localTracks = {
  screenVideoTrack: null,
  audioTrack: null,
  screenAudioTrack: null,
};
var remoteUsers = {};
// Agora client options
var options = {
  appid: "",
  channel: "47b4458d-1f35-40ae-af23-1968138f96ee",
  token: "",
  uid: "5432",
};

// the demo can auto join channel with params in url
$(() => {
  const params = ["appid", "channel", "uid", "token"];
  var urlParams = new URL(location.href).searchParams;

  params.forEach((param) => {
    if (urlParams.has(param)) {
      options[param] = urlParams.get(param);
    }
  });

  if (options.appid && options.channel) {
    $("#uid").val(options.uid);
    $("#appid").val(options.appid);
    $("#token").val(options.token);
    $("#channel").val(options.channel);
  }
});

$("#join-form").submit(async function (e) {
  e.preventDefault();
  $("#join").attr("disabled", true);
  try {
    options.channel = $("#channel").val();
    options.uid = Number($("#uid").val());
    options.appid = $("#appid").val();
    options.token = $("#token").val();

    console.debug("options", options);

    await join();

    if (options.token) {
      $("#success-alert-with-token").css("display", "block");
    } else {
      $("#success-alert a").attr(
        "href",
        `index.html?appid=${options.appid}&channel=${options.channel}&token=${options.token}`
      );
      $("#success-alert").css("display", "block");
    }
    $("#share-screen").attr("disabled", false);
  } catch (error) {
    console.error(error);
  } finally {
    $("#leave").attr("disabled", false);
  }
});

$("#leave").click(function (e) {
  leave();
});

$("#share-screen").click(() => {
  shareScreen();
});

$("#stop-sharing").click(() => {
  stopSharing();
});

async function shareScreen() {
  let screenTrack;

  console.debug("start creating tracks");
  // ** create local tracks, using microphone and screen
  [localTracks.audioTrack, screenTrack] = await Promise.all([
    AgoraRTC.createMicrophoneAudioTrack({
      encoderConfig: "music_standard",
    }),
    AgoraRTC.createScreenVideoTrack(
      {
        // ScreenEncoderConfigurationPreset works for screen sharing in Safari 16
        // encoderConfig: "720p",
        // But VideoEncoderConfiguration does not work
        encoderConfig: {
          width: {
            max: 1280,
          },
          height: {
            max: 720,
          },
          frameRate: 30,
        },
      },
      "disable"
    ),
  ]);

  console.debug("created tracks");

  if (screenTrack instanceof Array) {
    localTracks.screenVideoTrack = screenTrack[0];
    localTracks.screenAudioTrack = screenTrack[1];
  } else {
    localTracks.screenVideoTrack = screenTrack;
  }
  // play local video track
  localTracks.screenVideoTrack.play("local-player");
  $("#local-player-name").text(`localVideo(${options.uid})`);

  //bind "track-ended" event, and when screensharing is stopped, there is an alert to notify the end user.
  localTracks.screenVideoTrack.on("track-ended", () => {
    alert(
      `Screen-share track ended, stop sharing screen ` +
        localTracks.screenVideoTrack.getTrackId()
    );
    localTracks.screenVideoTrack && localTracks.screenVideoTrack.close();
    localTracks.screenAudioTrack && localTracks.screenAudioTrack.close();
    localTracks.audioTrack && localTracks.audioTrack.close();
  });

  // publish local tracks to channel
  if (localTracks.screenAudioTrack == null) {
    await client.publish([
      localTracks.screenVideoTrack,
      localTracks.audioTrack,
    ]);
  } else {
    await client.publish([
      localTracks.screenVideoTrack,
      localTracks.audioTrack,
      localTracks.screenAudioTrack,
    ]);
    console.debug("shareScreen");
  }

  $("#share-screen").attr("disabled", true);
  $("#stop-sharing").attr("disabled", false);
}

async function stopSharing() {
  for (const trackName in localTracks) {
    var track = localTracks[trackName];
    if (track) {
      track.stop();
      track.close();
      localTracks[trackName] = undefined;
    }
  }

  await client.unpublish();
  // await client.leave();
  // remove remote users and player views
  console.debug("stopSharing", localTracks);
  $("#local-player-name").text("");
  $("#stop-sharing").attr("disabled", true);
  $("#share-screen").attr("disabled", false);
}

async function join() {
  // add event listener to play remote tracks when remote user publishs.
  client.on("user-published", handleUserPublished);
  client.on("user-unpublished", handleUserUnpublished);

  await client.setClientRole("host");
  // join a channel
  options.uid = await client.join(
    options.appid,
    options.channel,
    options.token || null,
    options.uid || null
  );
  console.log("publish success");
}

async function leave() {
  $("#remote-playerlist").html("");

  if (
    localTracks.audioTrack ||
    localTracks.screenVideoTrack ||
    localTracks.screenAudioTrack
  ) {
    await stopSharing();
  }

  // leave the channel
  await client.leave();
  remoteUsers = {};
  $("#join").attr("disabled", false);
  $("#leave").attr("disabled", true);
  $("#share-screen").attr("disabled", true);
  $("#stop-sharing").attr("disabled", true);
  console.log("client leaves channel success");
}

async function subscribe(user, mediaType) {
  console.debug("subscribe", user, mediaType);

  const uid = user.uid;
  // subscribe to a remote user
  await client.subscribe(user, mediaType);
  console.log("subscribe success");
  if (mediaType === "video") {
    const player = $(`
      <div id="player-wrapper-${uid}">
        <p class="player-name">remoteUser(${uid})</p>
        <div id="player-${uid}" class="player"></div>
      </div>
    `);

    console.debug("append player");

    $("#remote-playerlist").append(player);
    user.videoTrack.play(`player-${uid}`);
  }

  if (mediaType === "audio") {
    user.audioTrack.play();
  }
}

function handleUserPublished(user, mediaType) {
  //print in the console log for debugging
  console.log('"user-published" event for remote users is triggered.');
  const id = user.uid;
  remoteUsers[id] = user;
  subscribe(user, mediaType);
}

function handleUserUnpublished(user, mediaType) {
  //print in the console log for debugging
  console.log('"user-unpublished" event for remote users is triggered.');

  if (mediaType === "video") {
    const id = user.uid;
    delete remoteUsers[id];
    $(`#player-wrapper-${id}`).remove();
  }
}

function getScreenFormFactor() {
  return window.screen.width / window.screen.height;
}

function getFormFactorWidth(height) {
  return getScreenFormFactor() * height;
}
