/** One authenticated server session per card, shared by parallel UI/mic startup. */
export class SessionClient {
  private id: string | undefined;
  private opening: Promise<string> | undefined;
  private closing: Promise<unknown> | undefined;
  constructor(private readonly send: (message: Record<string, unknown>) => Promise<any>) {}

  private async ensure(): Promise<string> {
    await this.closing;
    if (this.id) return this.id;
    if (!this.opening) {
      this.opening = this.send({ type: 'butler_native_audio_poc/open' }).then(result => {
        if (!/^[0-9a-f]{32}$/.test(result?.session_id)) throw new Error('Invalid audio session');
        this.id = result.session_id;
        return this.id;
      }).finally(() => { this.opening = undefined; });
    }
    return this.opening;
  }

  async message(message: Record<string, unknown>) {
    return { ...message, session_id: await this.ensure() };
  }

  async call(message: Record<string, unknown>): Promise<any> {
    if (message.type === 'butler_native_audio_poc/control' && message.command === 'disconnect') {
      if (this.closing) return this.closing;
      if (!this.id && !this.opening) return {};
      const current = this.opening ?? Promise.resolve(this.id!);
      this.id = undefined;
      const closing = current.then(id => this.send({ ...message, session_id: id })).finally(() => {
        if (this.closing === closing) { this.id = undefined; this.closing = undefined; }
      });
      this.closing = closing;
      return closing;
    }
    return this.send(await this.message(message));
  }
}
