// src/services/bitchatSignaling.js
import { supabase } from '../lib/supabaseConfig';
import { BitchatPeer } from './webrtcChat';

export function connectToBitchatRoom(roomId, isHost, onMessageCallback, onStatusCallback) {
  // 1. Instancia o Peer P2P
  const peer = new BitchatPeer(isHost, onMessageCallback, onStatusCallback);

  // 2. Abre um canal temporário na memória do Supabase (Sem salvar em tabela)
  const channel = supabase.channel(`bitchat_${roomId}`);

  // Monitora as trocas de sinal para fechar a conexão direta
  channel
    .on('broadcast', { event: 'signal' }, async ({ payload }) => {
      if (payload.type === 'offer' && !isHost) {
        await peer.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await peer.peerConnection.createAnswer();
        await peer.peerConnection.setLocalDescription(answer);

        // Envia resposta de volta pro Host
        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: { type: 'answer', sdp: answer }
        });
      } else if (payload.type === 'answer' && isHost) {
        await peer.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      } else if (payload.type === 'ice-candidate') {
        try {
          await peer.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (e) {
          console.error("Erro ao adicionar ICE Candidate", e);
        }
      }
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && isHost) {
        // O Host cria a Oferta de Conexão
        const offer = await peer.peerConnection.createOffer();
        await peer.peerConnection.setLocalDescription(offer);

        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: { type: 'offer', sdp: offer }
        });
      }
    });

  // Repassa candidatos de rede descobertos
  peer.peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: { type: 'ice-candidate', candidate: event.candidate }
      });
    }
  };

  return peer;
}