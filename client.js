const sdk = VoxImplant.getInstance();
let currentCall = null;
let isMicMuted = false;

const CLIENT_CONFIG = {
  USER: "invitado@video-contact-center.rbarahona.n2.voximplant.com",
  PASS: "temporal123*",
  RULE: "video-contact-center-queue",
  NODE: VoxImplant.ConnectionNode.NODE_2, 
};

async function init() {
  try {
    console.log("CLIENTE: Iniciando SDK...");

    await sdk.init({
      node: CLIENT_CONFIG.NODE, 
      queueType: VoxImplant.QueueTypes.SmartQueue,
      micRequired: true,
      videoSupport: true,
      progressTone: true,
    });

    console.log("CLIENTE: SDK inicializado, conectando...");

    await sdk.connect();
    console.log("CLIENTE: Conectado al nodo, iniciando login...");

    await sdk.login(CLIENT_CONFIG.USER, CLIENT_CONFIG.PASS);
    console.log("CLIENTE: Login exitoso como", CLIENT_CONFIG.USER);

    updateCallButton({
      text: "INICIAR VIDEOLLAMADA",
      enabled: true,
    });


    try {
      console.log("CLIENTE: Iniciando preview local fuera de la llamada...");
      const localDiv = document.getElementById("clientLocalVideo");
      await sdk.showLocalVideo(true, localDiv);
      
      console.log("CLIENTE: Preview local inicializada (showLocalVideo)");
      
      if (localDiv) {
        const videos = document.querySelectorAll("video");
        const lastVideo = videos[videos.length - 1];
        if (lastVideo && !localDiv.contains(lastVideo)) {
          localDiv.innerHTML = "";
          localDiv.appendChild(lastVideo);
          console.log("CLIENTE: Preview local movida dentro de #clientLocalVideo");
        }
      }
      const statusLabel = document.getElementById("statusLabel");
      if (statusLabel) statusLabel.innerText = "PREVIEW LOCAL ACTIVA";
    } catch (e) {
      console.warn("CLIENTE: No se pudo iniciar preview local anticipada", e);
    }

    // MONITOR CONTINUO: Detecta y mueve videos huérfanos cada 500ms
    setInterval(monitorAndMoveOrphanVideos, 500);

    console.log("CLIENTE: Listo para llamar.");
  } catch (e) {
    const btn = document.getElementById("btnCall");
    if (btn) btn.innerText = "ERROR";
    console.error("CLIENTE: Error crítico en init()", e);
  }
}

async function makeCall() {
  console.log(
    "%c>>> BOTÓN CLICKEADO: Iniciando makeCall",
    "background: #222; color: #bada55; font-size: 15px;"
  );

  const statusLabel = document.getElementById("statusLabel");
  if (!statusLabel) {
    console.error("ERROR: No se encontró el elemento 'statusLabel' en el HTML");
  } else {
    statusLabel.innerText = "PROCESANDO CLIC...";
  }

  try {
    console.log("CLIENTE: Llamando a la regla:", CLIENT_CONFIG.RULE);

    currentCall = sdk.call({
      number: CLIENT_CONFIG.RULE,
      video: {
        sendVideo: true,
        receiveVideo: true,
      },
    });
    updateCallButton({
      text: "SOLICITUD ENVIADA",
      enabled: false,
    });
    
    console.log("CLIENTE: Llamada enviada al SDK. ID temporal:", currentCall.id());

    // 1) VIDEO LOCAL DEL CLIENTE (saliente)
    currentCall.on(VoxImplant.CallEvents.LocalVideoStreamAdded, (event) => {
      console.log("CLIENTE: LocalVideoStreamAdded");
      const localContainer = document.getElementById("clientLocalVideo");
      if (!localContainer) return;
      
      localContainer.innerHTML = "";
      event.videoStream.render(localContainer);
    });

    // 2) VIDEO REMOTO DEL AGENTE (entrante)
    currentCall.on(VoxImplant.CallEvents.RemoteVideoStreamAdded, (event) => {
      console.log("CLIENTE: RemoteVideoStreamAdded (Call)");
      renderRemoteVideo(event.videoStream);
    });

    // 3) ENDPOINTS REMOTOS
    try {
      if (typeof currentCall.getEndpoints === "function") {
        const existingEndpoints = currentCall.getEndpoints();
        existingEndpoints.forEach(attachEndpointHandlers);
      }
    } catch (err) {
      console.error("CLIENTE: Error consultando endpoints:", err);
    }

    currentCall.on(VoxImplant.CallEvents.EndpointAdded, (e) => {
      attachEndpointHandlers(e.endpoint);
    });

    currentCall.on(VoxImplant.CallEvents.Connected, () => {
      console.log("%c✔ LLAMADA CONECTADA", "color: green; font-weight: bold;");
      if (statusLabel) statusLabel.innerText = "CONECTADO CON EL AGENTE";

    });

    currentCall.on(VoxImplant.CallEvents.Failed, (e) => {
      if (statusLabel) statusLabel.innerText = "FALLO: " + e.reason;
      currentCall = null;
      resetClientUI();
    });

    currentCall.on(VoxImplant.CallEvents.Disconnected, () => {
      if (statusLabel) statusLabel.innerText = "LLAMADA FINALIZADA";
      currentCall = null;
      resetClientUI();
      updateCallButton({
        text: "INICIAR VIDEOLLAMADA",
        enabled: true,
      });
    });
  } catch (error) {
    console.error("CRITICAL ERROR en makeCall:", error);
  }
}

function renderRemoteVideo(videoStream) {
  const remoteContainer = document.getElementById("agentVideo");
  
  if (!remoteContainer) {
    console.warn("CLIENTE: No se encontró el contenedor DIV 'agentVideo'");
    return;
  }

  try {
    // Limpiamos el contenedor primero
    remoteContainer.innerHTML = "";
    
    // Renderizamos el video en el contenedor
    videoStream.render(remoteContainer);
    
    console.log("CLIENTE: Video remoto renderizado en div#agentVideo");
    
  } catch (e) {
    console.error("CLIENTE: Error al renderizar video remoto", e);
  }
}

function monitorAndMoveOrphanVideos() {
  const allVideos = document.querySelectorAll("video");
  const localContainer = document.getElementById("clientLocalVideo");
  const remoteContainer = document.getElementById("agentVideo");
  
  allVideos.forEach(video => {
    // Si el video NO está dentro de ninguno de nuestros contenedores
    if (!localContainer.contains(video) && !remoteContainer.contains(video)) {
      console.warn("CLIENTE: Video huérfano detectado, moviendo a remoteContainer...");
      
      // Determinamos a cuál contenedor pertenece basándonos en el tamaño
      // Videos pequeños (preview local) vs videos grandes (remoto)
      const videoWidth = video.videoWidth || video.offsetWidth;
      
      if (videoWidth > 400 || video.videoWidth === 0) {
        // Probablemente es el video remoto (más grande)
        remoteContainer.innerHTML = "";
        remoteContainer.appendChild(video);
        console.log("✅ Video movido a agentVideo (remoto)");
      } else {
        // Probablemente es el video local (más pequeño)
        localContainer.innerHTML = "";
        localContainer.appendChild(video);
        console.log("✅ Video movido a clientLocalVideo (local)");
      }
    }
  });
}

function attachEndpointHandlers(endpoint) {
  if (!endpoint) return;
  
  endpoint.on(VoxImplant.EndpointEvents.RemoteVideoStreamAdded, (ev) => {
    console.log("CLIENTE: Endpoint Video detectado");
    renderRemoteVideo(ev.videoStream);
  });
    updateCallButton({
      text: "FINALIZAR LLAMADA",
      enabled: true,
    });
}

function resetClientUI() {
  const local = document.getElementById("clientLocalVideo");
  const remote = document.getElementById("agentVideo");
  const statusLabel = document.getElementById("statusLabel");

  if (local) local.innerHTML = "";
  if (remote) remote.innerHTML = '<p id="statusLabel" class="text-slate-500 font-mono text-xs">LISTO PARA CONECTAR</p>';
  if (statusLabel) statusLabel.innerText = "LISTO PARA CONECTAR";
}

function updateCallButton({ text, enabled }) {
  const btn = document.getElementById("btnCall");
  if (!btn) return;

  btn.innerText = text;
  btn.disabled = !enabled;

  btn.classList.remove(
    "bg-emerald-500",
    "hover:bg-emerald-400",
    "bg-slate-600",
    "cursor-not-allowed"
  );

  if (enabled) {
    btn.classList.add("bg-emerald-500", "hover:bg-emerald-400");
  } else {
    btn.classList.add("bg-slate-600", "cursor-not-allowed");
  }
}


document.getElementById("btnCall").addEventListener("click", () => {
  if (currentCall) {
    console.log("CLIENTE: Finalizando llamada...");
    try {
      currentCall.hangup();
    } catch (e) {
      console.error("Error colgando llamada", e);
    }
  } else {
    makeCall();
  }
});

function toggleMicrophoneMute() {
  const videos = document.querySelectorAll("video");

  let audioTrack = null;

  videos.forEach(video => {
    if (video.srcObject instanceof MediaStream) {
      const tracks = video.srcObject.getAudioTracks();
      if (tracks.length) audioTrack = tracks[0];
    }
  });

  if (!audioTrack) {
    console.warn("MIC: No se encontró audio track");
    return;
  }

  isMicMuted = !isMicMuted;
  audioTrack.enabled = !isMicMuted;

  console.log(
    `MICRÓFONO ${isMicMuted ? "MUTEADO" : "ACTIVO"}`
  );
}

document.getElementById("btnMic").addEventListener("click", () => {
  toggleMicrophoneMute();

  const btn = document.getElementById("btnMic");
  btn.innerText = isMicMuted ? "🔇 MIC OFF" : "🎤 MIC ON";
});

init();

