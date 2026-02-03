const sdk = VoxImplant.getInstance();
let currentCall = null;

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

    const btn = document.getElementById("btnCall");
    if (btn) btn.innerText = "INICIAR VIDEOLLAMADA";

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

    console.log("CLIENTE: Llamada enviada al SDK. ID temporal:", currentCall.id());

    // 1) VIDEO LOCAL DEL CLIENTE
    currentCall.on(VoxImplant.CallEvents.LocalVideoStreamAdded, (event) => {
      console.log("CLIENTE: LocalVideoStreamAdded");
      const localContainer = document.getElementById("clientLocalVideo");
      if (!localContainer) {
        console.warn("CLIENTE: No se encontró contenedor de video local (clientLocalVideo)");
        return;
      }
      localContainer.innerHTML = "";
      event.videoStream.render(localContainer);
    });

    // 2) ENDPOINTS REMOTOS (VIDEO DEL AGENTE)
    try {
      if (typeof currentCall.getEndpoints === "function") {
        const existingEndpoints = currentCall.getEndpoints();
        console.log("CLIENTE: Endpoints existentes en la llamada:", existingEndpoints.length);
        existingEndpoints.forEach(attachEndpointHandlers);
      } else {
        console.warn("CLIENTE: currentCall.getEndpoints no está disponible");
      }
    } catch (err) {
      console.error("CLIENTE: Error consultando endpoints existentes:", err);
    }

    currentCall.on(VoxImplant.CallEvents.EndpointAdded, (e) => {
      console.log("CLIENTE: EndpointAdded recibido");
      attachEndpointHandlers(e.endpoint);
    });

    currentCall.on(VoxImplant.CallEvents.Connected, () => {
      console.log("%c✔ LLAMADA CONECTADA AL SERVIDOR", "color: green; font-weight: bold;");
      if (statusLabel) statusLabel.innerText = "CONECTADO CON EL AGENTE";
    });

    currentCall.on(VoxImplant.CallEvents.Failed, (e) => {
      console.error("%c✘ LLAMADA FALLIDA", "color: red; font-weight: bold;", e.reason, e.code);
      if (statusLabel) statusLabel.innerText = "FALLO: " + e.reason;
      currentCall = null;
      resetClientUI();
    });

    currentCall.on(VoxImplant.CallEvents.Disconnected, () => {
      console.log("CLIENTE: Llamada finalizada (Disconnected)");
      if (statusLabel) statusLabel.innerText = "LLAMADA FINALIZADA";
      currentCall = null;
      resetClientUI();
    });
  } catch (error) {
    console.error("CRITICAL ERROR dentro de makeCall:", error);
  }
}

function attachEndpointHandlers(endpoint) {
  if (!endpoint) return;

  endpoint.on(VoxImplant.EndpointEvents.RemoteVideoStreamAdded, (ev) => {
    console.log("CLIENTE: RemoteVideoStreamAdded");

    const remoteContainer = document.getElementById("agentVideo");
    if (!remoteContainer) {
      console.warn("CLIENTE: No se encontró contenedor de video remoto (agentVideo)");
      return;
    }

    // 1) Intento “normal”: pedirle al SDK que pinte en la caja grande
    remoteContainer.innerHTML = "";
    ev.videoStream.render(remoteContainer);

    // 2) Si el SDK igualmente crea el <video> colgando de <body>,
    // lo reubicamos dentro de agentVideo.
    const videos = document.querySelectorAll("video");
    const lastVideo = videos[videos.length - 1];

    if (lastVideo && lastVideo.parentElement === document.body) {
      console.log("CLIENTE: Reubicando video remoto desde <body> a #agentVideo");
      remoteContainer.innerHTML = "";
      remoteContainer.appendChild(lastVideo);
    }
  });
}

function resetClientUI() {
  const local = document.getElementById("clientLocalVideo");
  const remote = document.getElementById("agentVideo");
  const statusLabel = document.getElementById("statusLabel");

  if (local) local.innerHTML = "PREVIEW LOCAL";
  if (remote) remote.innerHTML = '<p id="statusLabel" class="text-slate-500 font-mono text-xs">LISTO PARA CONECTAR</p>';
  if (statusLabel) statusLabel.innerText = "LISTO PARA CONECTAR";
}

document.getElementById("btnCall").addEventListener("click", makeCall);
init();