export type CalcRequest = {
  query: string;
  formulaId?: string;
};

export type ResultData = {
  formulaName: string;
  resultFormatted: string;
  resultUnit: string;
  resultLabel: string;
  formulaSymbolic: string;
  formulaSubstituted: string;
  variables: { symbol: string; name: string; value: string }[];
  steps: string[];
  note: string | null;
};

const API_BASE = process.env.EXPO_PUBLIC_API_URL
  ? process.env.EXPO_PUBLIC_API_URL
  : `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

export async function calculate(req: CalcRequest, accessToken: string): Promise<ResultData> {
  const res = await fetch(`${API_BASE}/calculate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `Erro ${res.status}`);
  }

  return res.json();
}
