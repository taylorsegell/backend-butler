/** One authenticated server session per card, shared by parallel UI/mic startup. */
export class SessionClient {
  private id: string | undefined;
  private opening: Promise<string> | undefined;
  private closing: Promise<unknown> | undefined;
  constructor(private readonly send: (message: Record<string, unknown>) => Promise<any>, private readonly selected: () => string | null = () => null) {}

  private async ensure(open = true): Promise<string | undefined> {
    await this.closing;
    if (this.id) return this.id;
    if (!this.opening) {
      if (!open) return undefined;
      this.opening = this.send({ type: 'backend_butler/native/open', ...(this.selected() ? {conversation_id: this.selected()} : {}) }).then(result => {
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
    if (message.type === 'backend_butler/native/control' && message.command === 'disconnect') {
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
    const starts = message.type === 'backend_butler/native/prepare' ||
      (message.type === 'backend_butler/native/control' && message.command === 'connect');
    const id = await this.ensure(starts);
    if (!id) return {};
    return this.send({ ...message, session_id: id });
  }
}
