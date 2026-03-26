export type ConfigurationState = {
  googleOAuthReady: boolean;
  llmReady: boolean;
  pdfParserReady: boolean;
  nextAuthReady: boolean;
};

export function getConfigurationState(): ConfigurationState {
  return {
    googleOAuthReady: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    llmReady: Boolean(process.env.OPENAI_API_KEY),
    pdfParserReady: Boolean(process.env.PDF_PARSER_URL),
    nextAuthReady: Boolean(process.env.NEXTAUTH_SECRET),
  };
}

export function getAppBaseUrl() {
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL;
  }

  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }

  return "http://localhost:3000";
}

export function getOpenAiModel() {
  return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
}

export function getPdfParserUrl() {
  return process.env.PDF_PARSER_URL?.replace(/\/$/, "") ?? null;
}
