/**
 * SimplePeer Type Extensions
 * Adds internal _pc property for accessing RTCPeerConnection
 */

import SimplePeer from 'simple-peer';

declare module 'simple-peer' {
  interface Instance {
    /**
     * Internal RTCPeerConnection instance
     * Used for quality monitoring and ICE state tracking
     */
    _pc?: RTCPeerConnection;
  }
}

