import type { P2PSignalMessage } from './types.js';

export function createOfferSignal(senderId: string, recipientId: string, sdp: any): P2PSignalMessage {
  return {
    type: 'offer',
    senderId,
    recipientId,
    sdp,
    timestamp: Date.now(),
  };
}

export function createAnswerSignal(senderId: string, recipientId: string, sdp: any): P2PSignalMessage {
  return {
    type: 'answer',
    senderId,
    recipientId,
    sdp,
    timestamp: Date.now(),
  };
}

export function createCandidateSignal(senderId: string, recipientId: string, candidate: any): P2PSignalMessage {
  return {
    type: 'candidate',
    senderId,
    recipientId,
    candidate,
    timestamp: Date.now(),
  };
}

export function createByeSignal(senderId: string, recipientId: string): P2PSignalMessage {
  return {
    type: 'bye',
    senderId,
    recipientId,
    timestamp: Date.now(),
  };
}
