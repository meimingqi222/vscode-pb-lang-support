export type SessionState = 'idle' | 'launching' | 'running' | 'stopped' | 'terminated';

export class SessionStateMachine {
  private _state: SessionState = 'idle';

  get state(): SessionState {
    return this._state;
  }

  transition(to: SessionState): void {
    this._state = to;
  }

  isRunning(): boolean    { return this._state === 'running'; }
  isStopped(): boolean    { return this._state === 'stopped'; }
  isTerminated(): boolean { return this._state === 'terminated'; }

  /** True when it makes sense to send protocol commands to the debuggee. */
  canSendCommand(): boolean {
    return this._state === 'stopped' || this._state === 'running';
  }
}
