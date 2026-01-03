export class OtpEmailEvent {
  constructor(
    public readonly email: string,
    public readonly name: string,
    public readonly otp: string
  ) {}
}
