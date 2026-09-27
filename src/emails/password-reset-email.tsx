import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Hr,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';
import type { PasswordResetEmailProps } from '../types/password-reset';

const fontFamily = 'Manrope, Arial, sans-serif';

export function PasswordResetEmail({ recipientName, resetUrl }: PasswordResetEmailProps) {
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';

  return (
    <Html lang="en">
      <Head />
      <Preview>Reset your EduFlow password</Preview>
      <Tailwind>
        <Body
          className="m-0 bg-[#020402] py-8 font-[Manrope,Arial,sans-serif] text-[#d4d4d8]"
          style={{ fontFamily }}
        >
          <Container className="mx-auto w-full max-w-[600px] px-4">
            <Section className="overflow-hidden rounded-[24px] border border-solid border-[#ffffff0f] bg-[#080c08]">
              <Section className="border-0 border-b border-solid border-b-[#ffffff0f] bg-[#020402] px-8 py-7">
                <Text
                  className="m-0 text-[12px] font-semibold tracking-[0.03em] text-[#a1a1aa]"
                  style={{ fontFamily }}
                >
                  EduFlow
                </Text>
                <Text
                  className="mb-0 mt-4 inline-block rounded-full border border-solid border-[#bef26433] bg-[#1a270c] px-3 py-1 text-[10px] font-bold uppercase leading-4 tracking-[0.18em] text-[#bef264]"
                  style={{ fontFamily }}
                >
                  Account security
                </Text>
              </Section>
              <Section className="px-8 py-9">
                <Heading
                  as="h1"
                  className="m-0 text-[28px] font-medium leading-[36px] tracking-[-0.4px] text-white"
                  style={{ fontFamily }}
                >
                  Reset your password
                </Heading>
                <Text
                  className="mb-0 mt-8 text-[16px] leading-7 text-[#d4d4d8]"
                  style={{ fontFamily }}
                >
                  {greeting}
                </Text>
                <Text
                  className="mb-0 mt-4 text-[16px] leading-7 text-[#d4d4d8]"
                  style={{ fontFamily }}
                >
                  Use the secure link below to choose a new password. It expires in 30 minutes and
                  can only be used once.
                </Text>
                <Button
                  href={resetUrl}
                  className="mt-8 rounded-full bg-[#bef264] px-5 py-3 text-[14px] font-semibold text-[#020402]"
                  style={{ fontFamily }}
                >
                  Reset password
                </Button>
                <Hr className="my-8 border-0 border-t border-solid border-t-[#ffffff0f]" />
                <Text className="m-0 text-[12px] leading-5 text-[#71717a]" style={{ fontFamily }}>
                  If you did not ask to reset your password, you can safely ignore this email.
                </Text>
              </Section>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
