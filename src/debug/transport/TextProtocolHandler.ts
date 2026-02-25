import { EventEmitter } from 'events';
import { CommandInfo } from '../types/debugTypes';

/**
 * Handles PureBasic text-based debugger protocol (macOS/Linux).
 * 
 * Protocol sequence:
 * 1. Client sends: "CONNECT <version> DEBUGGER\n\n"
 * 2. Server responds: "<password>\n" (or just "\n" if no password)
 * 3. Client sends binary data after handshake
 */
export class TextProtocolHandler extends EventEmitter {
  private buffer = '';
  private handshakeComplete = false;
  private pendingBinaryLength = 0;

  /**
   * Process incoming data from socket.
   * Returns parsed CommandInfo messages (may be empty if still in handshake).
   */
  append(data: Buffer): CommandInfo[] {
    if (!this.handshakeComplete) {
      return this.handleHandshake(data);
    }
    // After handshake, data should be binary protocol
    // Delegate to binary handler
    return [];
  }

  private handleHandshake(data: Buffer): CommandInfo[] {
    this.buffer += data.toString('utf8');
    
    // Check for complete handshake message (ends with \n\n or \r\n\r\n)
    const doubleNl = this.buffer.indexOf('\n\n');
    const doubleCrnl = this.buffer.indexOf('\r\n\r\n');
    const endIndex = doubleNl !== -1 ? doubleNl : doubleCrnl;
    
    if (endIndex === -1) {
      // Incomplete handshake message
      return [];
    }
    
    const message = this.buffer.substring(0, endIndex).trim();
    this.buffer = this.buffer.substring(endIndex + 2);
    
    // Parse CONNECT message
    const connectMatch = message.match(/^CONNECT\s+(\d+)\s+DEBUGGER$/i);
    if (connectMatch) {
      const version = parseInt(connectMatch[1], 10);
      this.emit('handshake', { version, raw: message });
      this.handshakeComplete = true;
      
      // Send password response (empty for now)
      this.emit('sendResponse', Buffer.from('\n', 'utf8'));
    } else {
      this.emit('error', new Error(`Unexpected handshake message: ${message}`));
    }
    
    return [];
  }

  /**
   * Get the response to send back for handshake.
   * Returns null if no response needed yet.
   */
  getHandshakeResponse(): Buffer | null {
    if (this.handshakeComplete) {
      return Buffer.from('\n', 'utf8'); // Empty password response
    }
    return null;
  }

  isHandshakeComplete(): boolean {
    return this.handshakeComplete;
  }

  reset(): void {
    this.buffer = '';
    this.handshakeComplete = false;
    this.pendingBinaryLength = 0;
  }
}
