export class PasswordResetEvent {
  constructor(
    public readonly email: string,
    public readonly name: string,
    public readonly otp: string
  ) {}
}
