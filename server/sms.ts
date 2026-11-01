export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<void>
}

export class ConsoleSmsProvider implements SmsProvider {
  async sendOtp(_phone: string, _code: string): Promise<void> {
    console.info('[sms:console] OTP generated. The console provider does not print the phone or the code.')
  }
}

export class KavenegarSmsProvider implements SmsProvider {
  constructor(
    private readonly apiKey: string,
    private readonly sender: string,
  ) {}

  async sendOtp(phone: string, code: string): Promise<void> {
    const url = `https://api.kavenegar.com/v1/${this.apiKey}/verify/lookup.json`
    const body = new URLSearchParams({
      receptor: phone,
      token: code,
      template: 'inview-otp',
      sender: this.sender,
    })
    const res = await fetch(url, { method: 'POST', body })
    if (!res.ok) {
      throw new Error(`Kavenegar SMS failed with status ${res.status}.`)
    }
  }
}

export function createSmsProvider(): SmsProvider {
  const apiKey = process.env.KAVENEGAR_API_KEY
  const sender = process.env.KAVENEGAR_SENDER
  if (apiKey && sender) return new KavenegarSmsProvider(apiKey, sender)
  return new ConsoleSmsProvider()
}
