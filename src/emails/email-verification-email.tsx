import { Body, Button, Container, Head, Heading, Html, Hr, Preview, Section, Tailwind, Text } from '@react-email/components';
import type { EmailVerificationEmailProps } from '../types/email-verification';

const fontFamily = 'Manrope, Arial, sans-serif';

export function EmailVerificationEmail({ recipientName, verificationUrl }: EmailVerificationEmailProps) {
  const greeting = recipientName ? `Hello ${recipientName},` : 'Hello,';

  return (
    <Html lang="en">
      <Head />
      <Preview>Verify your EduFlow email address</Preview>
      <Tailwind>
        <Body className="m-0 bg-[#020402] py-8 font-[Manrope,Arial,sans-serif] text-[#d4d4d8]" style={{ fontFamily }}>
          <Container className="mx-auto w-full max-w-[600px] px-4">
            <Section className="overflow-hidden rounded-[24px] border border-solid border-[#ffffff0f] bg-[#080c08]">
              <Section className="border-0 border-b border-solid border-b-[#ffffff0f] bg-[#020402] px-8 py-7">
                <Text className="m-0 text-[12px] font-semibold tracking-[0.03em] text-[#a1a1aa]" style={{ fontFamily }}>
                  EduFlow
                </Text>
                <Text className="mb-0 mt-4 inline-block rounded-full border border-solid border-[#bef26433] bg-[#1a270c] px-3 py-1 text-[10px] font-bold uppercase leading-4 tracking-[0.18em] text-[#bef264]" style={{ fontFamily }}>
                  Account security
                </Text>
              </Section>
              <Section className="px-8 py-9">
                <Heading as="h1" className="m-0 text-[28px] font-medium leading-[36px] tracking-[-0.4px] text-white" style={{ fontFamily }}>
                  Verify your email address
                </Heading>
                <Text className="mb-0 mt-8 text-[16px] leading-7 text-[#d4d4d8]" style={{ fontFamily }}>{greeting}</Text>
                <Text className="mb-0 mt-4 text-[16px] leading-7 text-[#d4d4d8]" style={{ fontFamily }}>
                  Confirm your email address to finish setting up your EduFlow account. This link expires in one hour.
                </Text>
                <Button href={verificationUrl} className="mt-8 rounded-full bg-[#bef264] px-5 py-3 text-[14px] font-semibold text-[#020402]" style={{ fontFamily }}>
                  Verify email address
                </Button>
                <Hr className="my-8 border-0 border-t border-solid border-t-[#ffffff0f]" />
                <Text className="m-0 text-[12px] leading-5 text-[#71717a]" style={{ fontFamily }}>
                  If you did not create an EduFlow account, you can safely ignore this email.
                </Text>
              </Section>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
