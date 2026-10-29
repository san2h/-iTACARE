// src/services/webrtcChat.js

export class BitchatPeer {
  constructor(isInitiator, onMessageReceived, onConnectionStatusChange) {
    // Usa servidores STUN públicos apenas para descobrir IP local/público no "aperto de mão"
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    this.dataChannel = null;
    this.onMessageReceived = onMessageReceived;
    this.onStatusChange = onConnectionStatusChange;

    if (isInitiator) {
      // O criador da sala gera o canal P2P
      this.dataChannel = this.peerConnection.createDataChannel('bitchat-mesh');
      this.setupDataChannel();
    } else {
      // Quem entra escuta o canal ser aberto
      this.peerConnection.ondatachannel = (event) => {
        this.dataChannel = event.channel;
        this.setupDataChannel();
      };
    }
  }

  setupDataChannel() {
    this.dataChannel.onopen = () => {
      if (this.onStatusChange) this.onStatusChange('connected');
    };

    this.dataChannel.onclose = () => {
      if (this.onStatusChange) this.onStatusChange('disconnected');
    };

    this.dataChannel.onmessage = (event) => {
      try {
        const messageData = JSON.parse(event.data);
        this.onMessageReceived(messageData);
      } catch (err) {
        console.error("Erro ao ler pacote P2P:", err);
      }
    };
  }

  // Envia a mensagem direta sem passar por nenhum banco de dados
  sendMessage(payload) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }
}