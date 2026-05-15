import React, { useState, useEffect } from "react";
import { MathView } from "@/components/MathView";
import { CalcSummaryCard } from "@/components/CalcSummaryCard";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { useQueryClient } from "@tanstack/react-query";
import colors from "@/constants/colors";
import type { ResultData, DesenvolvimentoStep } from "@/lib/apiClient";
import { fetchDesenvolvimento, fetchStripePlans, createStripeCheckout, createStripePortal, type StripePlan } from "@/lib/apiClient";
import { exportAsPDF, copyToClipboard } from "@/lib/exportCalc";
import {
  useFormulas,
  useSavedFormulaIds,
  useSessions,
  useToggleSaveFormula,
  useCalculations,
  useCarteira,
  type DbFormula,
  type DbSession,
  type CalcRecord,
} from "@/lib/queries";
import { useAuth } from "@/contexts/AuthContext";
import { FormulaDetailOverlay } from "@/components/FormulaDetailOverlay";

const c = colors.light;

export type Formula = DbFormula;

/* ─── SECTION HEADER ─── */
function DocSection({
  numero,
  titulo,
  children,
}: {
  numero: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.docSection}>
      <View style={styles.docSecHeader}>
        <Text style={styles.docSecNum}>{numero}</Text>
        <Text style={styles.docSecTitle}>{titulo}</Text>
      </View>
      <View style={styles.docSecDivider} />
      {children}
    </View>
  );
}

/* ─── CACHE DE MÓDULO — persiste entre mounts do CalcOverlay na mesma sessão ─── */
const _devCache = new Map<string, { steps: DesenvolvimentoStep[]; interpretacao: string | null }>();

function _devCacheKey(input: NonNullable<ResultData["desenvolvimentoInput"]>): string {
  return `${input.expression}::${input.solveFor}::${input.computedValue}`;
}

/* ─── CALC OVERLAY ─── */
export function CalcOverlay({
  data,
  onClose,
  onDesenvolvimentoLoaded,
}: {
  data: ResultData;
  onClose: () => void;
  onDesenvolvimentoLoaded?: (steps: DesenvolvimentoStep[], interpretacao: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const botPad = insets.bottom;
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "ok" | "err">("idle");
  const [copied, setCopied] = useState(false);
  const { data: carteira } = useCarteira();
  const plano = carteira?.plano ?? "free";
  const pdfLimite = carteira?.pdfLimite ?? 0;
  const pdfUsados = carteira?.pdfUsadosHoje ?? 0;
  const isPdfBloqueado = plano === "free";
  const isPdfEsgotado = !isPdfBloqueado && pdfUsados >= pdfLimite;
  const [lazySteps, setLazySteps] = useState<DesenvolvimentoStep[] | null>(null);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [interpretacaoLazy, setInterpretacaoLazy] = useState<string | null>(null);

  // Chave estável derivada de primitivos — evita dependência de referência de objeto
  const devKey = data.desenvolvimentoInput
    ? _devCacheKey(data.desenvolvimentoInput)
    : null;
  const alreadyHasDev = (data.desenvolvimento?.length ?? 0) > 0;

  useEffect(() => {
    // 1. Desenvolvimento já vem preenchido no resultado — renderização usa data.desenvolvimento diretamente
    if (alreadyHasDev) return;

    if (!devKey || !data.desenvolvimentoInput) return;

    // 2. Cache de módulo — previne re-fetch em aberturas repetidas do mesmo resultado
    const cached = _devCache.get(devKey);
    if (cached) {
      setLazySteps(cached.steps);
      setInterpretacaoLazy(cached.interpretacao);
      return;
    }

    // 3. Fetch único — armazena em cache e notifica pai para persistir nos items do chat
    setLoadingSteps(true);
    fetchDesenvolvimento(data.desenvolvimentoInput)
      .then((r) => {
        setLazySteps(r.steps);
        setInterpretacaoLazy(r.interpretacao);
        _devCache.set(devKey, { steps: r.steps, interpretacao: r.interpretacao });
        onDesenvolvimentoLoaded?.(r.steps, r.interpretacao);
      })
      .catch(() => setLazySteps([]))
      .finally(() => setLoadingSteps(false));
  }, [devKey, alreadyHasDev]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExportPDF = async () => {
    if (exporting) return;
    if (isPdfBloqueado) {
      Alert.alert(
        "Recurso exclusivo",
        "O plano Gratuito não inclui exportação de PDF. Faça upgrade para o plano Inicial (2/dia) ou Pro (10/dia).",
        [{ text: "OK" }]
      );
      return;
    }
    if (isPdfEsgotado) {
      Alert.alert(
        "Limite atingido",
        `Você usou todos os ${pdfLimite} PDF${pdfLimite > 1 ? "s" : ""} disponíveis hoje no plano ${plano === "starter" ? "Inicial" : "Pro"}. O limite renova à meia-noite.`,
        [{ text: "OK" }]
      );
      return;
    }
    setExporting(true);
    setExportStatus("idle");
    try {
      await exportAsPDF(data);
      if (Platform.OS === "android") {
        Alert.alert("Arquivo salvo", "PDF salvo na pasta Downloads do seu dispositivo.");
      }
      setExportStatus("ok");
      setTimeout(() => setExportStatus("idle"), 3000);
    } catch (err: any) {
      console.error("[exportAsPDF]", err);
      const code = (err as any)?.code;
      if (code === "plano_insuficiente") {
        Alert.alert("Recurso exclusivo", "Faça upgrade para o plano Inicial ou Pro para exportar PDFs.");
      } else if (code === "limite_pdf_atingido") {
        Alert.alert("Limite atingido", err?.message ?? "Limite diário de PDF atingido. Tente novamente amanhã.");
      } else {
        Alert.alert("Erro ao exportar", err?.message ?? "Tente novamente.");
      }
    } finally {
      setExporting(false);
    }
  };

  const handleCopy = async () => {
    await copyToClipboard(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const now = new Date();
  const today = now.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const time = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  /* ── Converte valor de variável para LaTeX básico ──
     "150 km" → "150\;\text{km}"  |  "75" → "75"  |  "R$ 1.000" → "\text{R\$ 1.000}" */
  function valueToLatex(valor: string): string {
    if (!valor) return "";
    // Número (pt-BR: pontos de milhar, vírgula decimal) seguido de unidade opcional
    const match = valor.match(/^([\d.,]+)\s*(.*)$/);
    if (match) {
      const num = match[1].replace(/\./g, "{.}").replace(/,/g, "{,}");
      const unit = match[2].trim();
      if (unit) {
        const safeUnit = unit.replace(/\$/g, "\\$").replace(/%/g, "\\%");
        return `${num}\\;\\text{${safeUnit}}`;
      }
      return num;
    }
    // Fallback: texto puro
    const safe = valor.replace(/\$/g, "\\$").replace(/%/g, "\\%");
    return `\\text{${safe}}`;
  }

  const subcategoria = data.meta?.subcategoria ?? "";
  const resultValor = data.resultado?.valor ?? "";
  const resultUnidade = data.resultado?.unidade ?? "";
  const formulaLatex = data.formula?.latex ?? null;
  const formulaAbstrata = data.formula?.abstrata ?? "";
  const variaveis = data.variaveis ?? [];
  const desenvolvimento = lazySteps ?? data.desenvolvimento ?? [];
  const objetivo = data.objetivo ?? null;

  const hasFormula = !!(formulaLatex || formulaAbstrata);

  let sectionNum = 0;
  const nextSec = () => String(++sectionNum).padStart(2, "0");

  return (
    <View style={[styles.overlay, { paddingTop: topPad }]}>
      {/* ── Header ── */}
      <View style={styles.overlayHeader}>
        <Text style={styles.overlayTitle}>Cálculo</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleCopy}
            style={[styles.exportBtn, copied && styles.exportBtnActive]}
            hitSlop={8}
          >
            <Feather name={copied ? "check" : "copy"} size={13} color={copied ? "#fff" : c.mid} />
            <Text style={[styles.exportBtnText, copied && styles.exportBtnTextActive]}>
              {copied ? "copiado!" : "copiar"}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleExportPDF}
            disabled={exporting}
            style={[
              styles.exportBtn,
              styles.exportBtnPDF,
              exporting && { opacity: 0.6 },
              (isPdfBloqueado || isPdfEsgotado) && { opacity: 0.55 },
              exportStatus === "ok" && { backgroundColor: "#4CAF50" },
              exportStatus === "err" && { backgroundColor: "#E53935" },
            ]}
            hitSlop={8}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#fff" style={{ width: 13, height: 13 }} />
            ) : exportStatus === "ok" ? (
              <Feather name="check" size={13} color="#fff" />
            ) : exportStatus === "err" ? (
              <Feather name="alert-circle" size={13} color="#fff" />
            ) : isPdfBloqueado ? (
              <Feather name="lock" size={13} color="#fff" />
            ) : isPdfEsgotado ? (
              <Feather name="slash" size={13} color="#fff" />
            ) : (
              <Feather name="share" size={13} color="#fff" />
            )}
            <Text style={[styles.exportBtnText, styles.exportBtnTextActive]}>
              {exporting ? "gerando…" : exportStatus === "ok" ? "baixado!" : exportStatus === "err" ? "erro" : isPdfBloqueado ? "bloqueado" : isPdfEsgotado ? `${pdfUsados}/${pdfLimite}` : "salvar"}
            </Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
            <Feather name="x" size={18} color={c.faint} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.overlayBody, { paddingBottom: botPad + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Objetivo (destaque principal) ── */}
        {!!objetivo && (
          <View style={styles.objetivoHero}>
            <View style={styles.objetivoHeroMeta}>
              <Text style={styles.objetivoHeroLabel}>Objetivo</Text>
              {data.searchUsed && (
                <View style={styles.idBadge}>
                  <Feather name="globe" size={9} color={c.mid} />
                  <Text style={styles.idBadgeText}>pesquisa web</Text>
                </View>
              )}
            </View>
            <Text style={styles.objetivoHeroText}>{objetivo}</Text>
          </View>
        )}

        {/* ── 01 Fórmula ── */}
        {hasFormula && (
          <DocSection numero={nextSec()} titulo="Fórmula">
            <View style={styles.formulaDocBox}>
              {formulaLatex ? (
                <MathView latex={formulaLatex} color={c.text} />
              ) : (
                <Text style={styles.formulaDocSymbolic}>{formulaAbstrata}</Text>
              )}
            </View>
          </DocSection>
        )}

        {/* ── 02 Variáveis ── */}
        {variaveis.length > 0 && (
          <DocSection numero={nextSec()} titulo="Variáveis">
            {variaveis.map((v, i) => (
              <View
                key={i}
                style={[
                  styles.docVarRow,
                  i < variaveis.length - 1 && styles.rowBorder,
                ]}
              >
                {/* Linha superior: símbolo + nome + valor */}
                <View style={styles.docVarTop}>
                  <View style={styles.docVarSymbolBox}>
                    <MathView latex={v.simbolo} color={c.text} fontSize={14} />
                  </View>
                  <Text style={styles.docVarName} numberOfLines={1} ellipsizeMode="tail">
                    {v.descricao}
                  </Text>
                  <View style={styles.docVarValueBox}>
                    <MathView latex={valueToLatex(v.unidade ? `${v.valor} ${v.unidade}` : v.valor)} color={c.text} fontSize={13} />
                  </View>
                </View>
                {/* Linha inferior: papel/descrição complementar (largura total) */}
                {!!v.papel && v.papel !== v.descricao && (
                  <View style={styles.docVarBottom}>
                    <Text style={styles.docVarPapel}>{v.papel}</Text>
                  </View>
                )}
              </View>
            ))}
          </DocSection>
        )}

        {/* ── 03 Desenvolvimento ── */}
        {(loadingSteps || desenvolvimento.length > 0) && (
          <DocSection numero={nextSec()} titulo="Desenvolvimento">
            {loadingSteps ? (
              <View style={styles.loadingStepsRow}>
                <ActivityIndicator size="small" color={c.mid} />
                <Text style={styles.loadingStepsText}>Gerando passo a passo…</Text>
              </View>
            ) : (
              desenvolvimento.map((step, i) => {
                const isLast = i === desenvolvimento.length - 1;
                return (
                  <View key={i} style={styles.docStepRow}>
                    <View style={styles.docStepTrack}>
                      <View style={[
                        styles.docStepDot,
                        step.tipo === "resultado" && styles.docStepDotResult,
                      ]} />
                      {!isLast && <View style={styles.docStepLine} />}
                    </View>
                    <View style={styles.docStepContent}>
                      <Text style={styles.docStepText}>{step.descricao}</Text>
                      {!!step.justificativa && (
                        <Text style={styles.docStepJustificativa}>{step.justificativa}</Text>
                      )}
                      {step.latex && (
                        <MathView latex={step.latex} color={step.tipo === "resultado" ? c.text : c.mid} />
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </DocSection>
        )}

        {/* ── 04 Resultado ── */}
        <DocSection numero={nextSec()} titulo="Resultado">
          <View style={styles.resultDocCard}>
            {!!resultUnidade && (
              <Text style={styles.resultDocUnit}>{resultUnidade}</Text>
            )}
            <Text
              style={[
                styles.resultDocNum,
                resultValor.length > 10 ? { fontSize: 22 } : resultValor.length > 6 ? { fontSize: 28 } : {},
              ]}
            >
              {resultValor}
            </Text>
            {!!subcategoria && (
              <Text style={styles.resultDocLabel}>{subcategoria}</Text>
            )}
            {!!data.resultado?.interpretacao && (
              <Text style={styles.interpretacaoText}>{data.resultado.interpretacao}</Text>
            )}
          </View>
        </DocSection>


        {/* ── Footer ── */}
        <View style={styles.docFooter}>
          <Text style={styles.docFooterText}>Φ Phormula</Text>
          <Text style={styles.docFooterText}>{today} · {time}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

/* ─── HISTORY OVERLAY ─── */
export function HistoryOverlay({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (s: DbSession) => void;
}) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { data: sessions, isLoading } = useSessions();

  return (
    <View style={[styles.overlay, { paddingTop: topPad }]}>
      <View style={styles.overlayHeader}>
        <Text style={styles.overlayTitle}>Histórico</Text>
        <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
          <Feather name="x" size={18} color={c.faint} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.overlayBody,
          { paddingBottom: 28 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator color={c.ghost} />
          </View>
        ) : sessions?.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Nenhum cálculo ainda</Text>
          </View>
        ) : (
          sessions?.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => onSelect(s)}
              style={({ pressed }) => [styles.sessionRow, pressed && styles.rowPressed]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.sessionTitle} numberOfLines={1}>
                  {s.title}
                </Text>
                <Text style={styles.sessionMeta}>
                  {new Date(s.updated_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
              <Feather name="chevron-right" size={13} color={c.ghost} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/* ─── CALCULATIONS SCREEN ─── */
export function CalculationsScreen({
  onClose,
  onView,
}: {
  onClose: () => void;
  onView: (result: ResultData) => void;
}) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { data: calcs, isLoading } = useCalculations();

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <View style={[styles.overlay, { paddingTop: topPad }]}>
      <View style={styles.overlayHeader}>
        <Text style={styles.overlayTitle}>Cálculos</Text>
        <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
          <Feather name="x" size={18} color={c.faint} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.overlayBody,
          { paddingBottom: 28 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator color={c.ghost} />
          </View>
        ) : !calcs || calcs.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Nenhum cálculo ainda</Text>
          </View>
        ) : (
          calcs.map((item: CalcRecord) => (
            <View key={item.id}>
              <CalcSummaryCard
                result={item.result_data}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onView(item.result_data);
                }}
                variant="list"
              />
              <View style={styles.listDivider} />
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

/* ─── PLANS DATA ─── */
const PLANS = [
  {
    id: "free",
    name: "Gratuito",
    price: null,
    priceLabel: "Grátis",
    credits: 10,
    creditsLabel: "10 créditos",
    creditsNote: "renovam todo dia à meia-noite",
    features: [
      "Acesso à biblioteca de fórmulas",
      "Histórico de cálculos",
      "Cálculo passo a passo",
      "Verificação matemática",
    ],
    highlight: false,
    cta: "Plano atual",
    ctaDisabled: true,
  },
  {
    id: "starter",
    name: "Inicial",
    price: 19.90,
    priceLabel: "R$\u202F19,90",
    credits: 500,
    creditsLabel: "500 créditos",
    creditsNote: "por mês, renovam todo mês",
    features: [
      "Tudo do Gratuito",
      "2 exportações PDF por dia",
      "Créditos mensais recorrentes",
      "Suporte por e-mail",
    ],
    highlight: false,
    cta: "Assinar Inicial",
    ctaDisabled: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: 59.90,
    priceLabel: "R$\u202F59,90",
    credits: 2000,
    creditsLabel: "2.000 créditos",
    creditsNote: "por mês, renovam todo mês",
    features: [
      "Tudo do Inicial",
      "10 exportações PDF por dia",
      "4× mais créditos",
      "Suporte prioritário",
    ],
    highlight: true,
    cta: "Assinar Pro",
    ctaDisabled: false,
  },
];

/* ─── PLANS SCREEN ─── */
export function PlansScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [planPriceIds, setPlanPriceIds] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchStripePlans().then((plans) => {
      const map: Record<string, string> = {};
      for (const p of plans) {
        const planId = p.metadata?.plan_id;
        const priceId = p.prices[0]?.id;
        if (planId && priceId) map[planId] = priceId;
      }
      setPlanPriceIds(map);
    });
  }, []);

  const handleCta = async (plan: typeof PLANS[number]) => {
    if (plan.ctaDisabled) return;

    const priceId = planPriceIds[plan.id];
    if (!priceId) {
      Alert.alert("Indisponível", "Pagamentos em breve. Entre em contato: contato@phormula.app");
      return;
    }

    setCheckoutLoading(plan.id);
    try {
      const email = session?.user?.email;
      const { url } = await createStripeCheckout(priceId, email);
      const result = await WebBrowser.openAuthSessionAsync(url, "mobile://checkout/");
      if (result.type === "success") {
        await queryClient.invalidateQueries({ queryKey: ["carteira"] });
        Alert.alert("Assinatura ativada!", "Seus créditos foram adicionados à sua conta.");
        onClose();
      }
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Não foi possível abrir o pagamento. Tente novamente.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <View style={[styles.overlay, { paddingTop: topPad }]}>
      <View style={styles.overlayHeader}>
        <Text style={styles.overlayTitle}>Planos</Text>
        <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
          <Feather name="x" size={18} color={c.faint} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 + insets.bottom, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {PLANS.map((plan) => (
          <View
            key={plan.id}
            style={[styles.planCard, plan.highlight && styles.planCardHighlight]}
          >
            {plan.highlight && (
              <View style={styles.planBadge}>
                <Text style={styles.planBadgeText}>MAIS POPULAR</Text>
              </View>
            )}

            {/* Header */}
            <View style={styles.planHeader}>
              <Text style={[styles.planName, plan.highlight && styles.planNameHighlight]}>
                {plan.name}
              </Text>
              <View style={styles.planPriceRow}>
                <Text style={[styles.planPrice, plan.highlight && styles.planPriceHighlight]}>
                  {plan.priceLabel}
                </Text>
                {plan.price !== null && (
                  <Text style={styles.planPricePeriod}>/mês</Text>
                )}
              </View>
            </View>

            {/* Credits */}
            <View style={styles.planCreditsBox}>
              <Text style={[styles.planCreditsNum, plan.highlight && styles.planCreditsNumHighlight]}>
                {plan.creditsLabel}
              </Text>
              <Text style={styles.planCreditsNote}>{plan.creditsNote}</Text>
            </View>

            {/* Divider */}
            <View style={styles.planDivider} />

            {/* Features */}
            <View style={styles.planFeatures}>
              {plan.features.map((f, i) => (
                <View key={i} style={styles.planFeatureRow}>
                  <Feather name="check" size={13} color={plan.highlight ? "#2A7A4B" : c.mid} />
                  <Text style={styles.planFeatureText}>{f}</Text>
                </View>
              ))}
            </View>

            {/* CTA */}
            <Pressable
              onPress={() => handleCta(plan)}
              disabled={plan.ctaDisabled || checkoutLoading === plan.id}
              style={({ pressed }) => [
                styles.planCta,
                plan.highlight && styles.planCtaHighlight,
                (plan.ctaDisabled || checkoutLoading === plan.id) && styles.planCtaDisabled,
                pressed && !plan.ctaDisabled && checkoutLoading !== plan.id && { opacity: 0.8 },
              ]}
            >
              {checkoutLoading === plan.id ? (
                <ActivityIndicator size="small" color={plan.highlight ? "#fff" : c.mid} />
              ) : (
                <Text style={[
                  styles.planCtaText,
                  plan.highlight && styles.planCtaTextHighlight,
                  plan.ctaDisabled && styles.planCtaTextDisabled,
                ]}>
                  {plan.cta}
                </Text>
              )}
            </Pressable>
          </View>
        ))}

        <Text style={styles.planDisclaimer}>
          Pagamentos serão processados de forma segura. Cancele quando quiser.
        </Text>
      </ScrollView>
    </View>
  );
}

/* ─── PLAN MANAGEMENT SCREEN ─── */
export function PlanManagementScreen({
  onClose,
  onViewPlans,
}: {
  onClose: () => void;
  onViewPlans: () => void;
}) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;
  const { data: carteira, isLoading } = useCarteira();

  const saldo = carteira?.saldo ?? null;
  const totalConsultas = carteira?.totalConsultas ?? 0;
  const totalCreditosConsumidos = carteira?.totalCreditosConsumidos ?? 0;

  const usedCredits = 10 - (saldo ?? 10);
  const usedPct = Math.min(100, Math.max(0, (usedCredits / 10) * 100));

  return (
    <View style={[styles.overlay, { paddingTop: topPad }]}>
      <View style={styles.overlayHeader}>
        <Text style={styles.overlayTitle}>Meu Plano</Text>
        <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
          <Feather name="x" size={18} color={c.faint} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 + insets.bottom, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Plan badge */}
        <View style={styles.mgmtPlanBadge}>
          <View style={styles.mgmtPlanBadgeLeft}>
            <Text style={styles.mgmtPlanLabel}>PLANO ATUAL</Text>
            <Text style={styles.mgmtPlanName}>Gratuito</Text>
          </View>
          <Pressable
            onPress={onViewPlans}
            style={({ pressed }) => [styles.mgmtUpgradeBtn, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.mgmtUpgradeBtnText}>Ver planos</Text>
            <Feather name="chevron-right" size={13} color={c.background} />
          </Pressable>
        </View>

        {/* Credits card */}
        <View style={styles.mgmtCard}>
          <Text style={styles.mgmtCardLabel}>CRÉDITOS</Text>
          {isLoading ? (
            <ActivityIndicator color={c.ghost} style={{ marginVertical: 12 }} />
          ) : (
            <>
              <View style={styles.mgmtCreditsRow}>
                <Text style={styles.mgmtCreditsNum}>
                  {saldo !== null ? saldo.toLocaleString("pt-BR") : "—"}
                </Text>
                <Text style={styles.mgmtCreditsSuffix}> / 10</Text>
              </View>
              <Text style={styles.mgmtCreditsNote}>créditos de boas-vindas disponíveis</Text>

              {/* Progress bar */}
              <View style={styles.mgmtProgressBg}>
                <View style={[styles.mgmtProgressFill, { width: `${100 - usedPct}%` as any }]} />
              </View>
            </>
          )}
        </View>

        {/* Stats card */}
        <View style={styles.mgmtCard}>
          <Text style={styles.mgmtCardLabel}>USO ACUMULADO</Text>
          <View style={styles.mgmtStatsRow}>
            <View style={styles.mgmtStat}>
              <Text style={styles.mgmtStatNum}>{totalConsultas.toLocaleString("pt-BR")}</Text>
              <Text style={styles.mgmtStatLabel}>cálculos realizados</Text>
            </View>
            <View style={styles.mgmtStatDivider} />
            <View style={styles.mgmtStat}>
              <Text style={styles.mgmtStatNum}>
                {totalConsultas > 0 ? (totalCreditosConsumidos / totalConsultas).toFixed(1) : "—"}
              </Text>
              <Text style={styles.mgmtStatLabel}>créditos por cálculo</Text>
            </View>
          </View>
        </View>

        {/* Upgrade prompt */}
        <Pressable
          onPress={onViewPlans}
          style={({ pressed }) => [styles.mgmtUpgradeCard, pressed && { opacity: 0.9 }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.mgmtUpgradeCardTitle}>Precisa de mais créditos?</Text>
            <Text style={styles.mgmtUpgradeCardSub}>
              Inicial: 500 cr/mês por R$19,90 · Pro: 2.000 cr/mês por R$59,90
            </Text>
          </View>
          <Feather name="arrow-right" size={16} color={c.text} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

/* ─── FORMULA CARD ─── */
function FormulaCard({
  f,
  savedIds,
  onSelect,
  onDetail,
  onToggleSave,
}: {
  f: DbFormula;
  savedIds: Set<string>;
  onSelect: (f: DbFormula) => void;
  onDetail: (f: DbFormula) => void;
  onToggleSave: (f: DbFormula, isSaved: boolean) => void;
}) {
  const isSaved = savedIds.has(f.id);
  return (
    <Pressable
      onPress={() => onSelect(f)}
      style={({ pressed }) => [styles.formulaCard, pressed && styles.rowPressed]}
    >
      <View style={styles.formulaCardHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.formulaCat}>{f.category}</Text>
          <Text style={styles.formulaName}>{f.name}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {/* Info / detalhe */}
          <Pressable
            hitSlop={10}
            onPress={(e) => { e.stopPropagation(); onDetail(f); }}
            style={styles.infoBtn}
          >
            <Feather name="info" size={13} color={c.ghost} />
          </Pressable>
          {/* Salvar (só para não-sistema) */}
          {!f.is_system && (
            <Pressable
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                Haptics.impactAsync(isSaved ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
                onToggleSave(f, isSaved);
              }}
              style={({ pressed }) => [
                styles.bookmarkPill,
                isSaved && styles.bookmarkPillSaved,
                pressed && styles.bookmarkPillPressed,
              ]}
            >
              <Feather name="bookmark" size={12} color={isSaved ? "#fff" : c.ghost} />
              <Text style={[styles.bookmarkPillText, isSaved && styles.bookmarkPillTextSaved]}>
                {isSaved ? "salva ✓" : "salvar"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <Text style={styles.formulaDesc} numberOfLines={2}>{f.description}</Text>
      <Text style={styles.formulaSymbolicSmall}>{f.symbolic}</Text>

      {/* Badges */}
      <View style={{ flexDirection: "row", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
        {f.llm_verdict === "approved" && (
          <View style={styles.cardBadgeOk}>
            <Feather name="cpu" size={9} color="#2A7A4B" />
            <Text style={styles.cardBadgeTextOk}>IA verificou</Text>
          </View>
        )}
        {f.llm_verdict === "flagged" && (
          <View style={styles.cardBadgeWarn}>
            <Feather name="cpu" size={9} color="#B07D1A" />
            <Text style={styles.cardBadgeTextWarn}>IA sinalizou</Text>
          </View>
        )}
        {f.is_public && !f.is_system && (
          <View style={styles.cardBadgeCommunity}>
            <Feather name="globe" size={9} color="#3A6B9A" />
            <Text style={styles.cardBadgeTextCommunity}>comunidade</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

/* ─── FORMULAS SCREEN ─── */
export function FormulasScreen({
  onSelect,
  onClose,
}: {
  onSelect: (f: DbFormula) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top;

  type Tab = "oficiais" | "comunidade" | "minhas";
  const [tab, setTab] = useState<Tab>("oficiais");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [detailFormula, setDetailFormula] = useState<DbFormula | null>(null);

  const { data: allFormulas = [], isLoading: loadingFormulas } = useFormulas();
  const { data: savedIds = new Set<string>() } = useSavedFormulaIds();
  const { userId: currentUserId } = useAuth();
  const toggleSave = useToggleSaveFormula();

  const officialFormulas = allFormulas.filter((f) => f.is_system);
  const communityFormulas = allFormulas.filter((f) => !f.is_system && f.is_public);
  const myFormulas = allFormulas.filter(
    (f) => !f.is_system && (f.user_id === currentUserId || savedIds.has(f.id))
  );

  const baseList =
    tab === "oficiais" ? officialFormulas :
    tab === "comunidade" ? communityFormulas :
    myFormulas;

  const cats = ["Todos", ...Array.from(new Set(officialFormulas.map((f) => f.category))).sort()];

  const list = baseList.filter((f) => {
    const q = search.toLowerCase();
    const matchSearch = f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q);
    const matchCat = tab !== "oficiais" || category === "Todos" || f.category === category;
    return matchSearch && matchCat;
  });

  const emptyLabels: Record<Tab, string> = {
    oficiais: "Nenhum resultado",
    comunidade: "Nenhuma fórmula publicada ainda",
    minhas: "Você ainda não tem fórmulas salvas",
  };

  return (
    <View style={[styles.overlay, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 }}>
        <View style={styles.overlayHeaderRow}>
          <Text style={styles.overlayTitle}>Fórmulas</Text>
          <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={12}>
            <Feather name="x" size={18} color={c.faint} />
          </Pressable>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          {(["oficiais", "comunidade", "minhas"] as Tab[]).map((t) => (
            <Pressable
              key={t}
              onPress={() => { setTab(t); setSearch(""); setCategory("Todos"); }}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            >
              <Text style={[styles.tabBtnText, tab === t && styles.tabBtnTextActive]}>
                {t === "oficiais" ? "Oficiais" : t === "comunidade" ? "Comunidade" : "Minhas"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Search */}
        <View style={styles.searchBox}>
          <Text style={styles.sigmaText}>Φ</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar fórmula…"
            placeholderTextColor={c.ghost}
            style={styles.searchInput}
          />
          {!!search && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Feather name="x" size={13} color={c.ghost} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Category chips (apenas aba Oficiais) */}
      {tab === "oficiais" && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.catScroll}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 6, flexDirection: "row", alignItems: "flex-start" }}
        >
          {cats.map((cat) => (
            <Pressable
              key={cat}
              onPress={() => setCategory(cat)}
              style={[styles.catChip, category === cat && styles.catChipActive]}
            >
              <Text style={[styles.catChipText, category === cat && styles.catChipTextActive]}>
                {cat}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Lista */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.overlayBody, { paddingTop: 10, paddingBottom: 28 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {loadingFormulas ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator color={c.ghost} />
          </View>
        ) : list.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{emptyLabels[tab]}</Text>
          </View>
        ) : (
          list.map((f) => (
            <FormulaCard
              key={f.id}
              f={f}
              savedIds={savedIds}
              onSelect={onSelect}
              onDetail={setDetailFormula}
              onToggleSave={(formula, isSaved) =>
                toggleSave.mutate({ formulaId: formula.id, isSaved })
              }
            />
          ))
        )}
      </ScrollView>

      {/* Detalhe da fórmula */}
      {detailFormula && (
        <FormulaDetailOverlay
          formula={detailFormula}
          currentUserId={currentUserId}
          onClose={() => setDetailFormula(null)}
          onUse={(f) => {
            setDetailFormula(null);
            onSelect(f);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.background,
    zIndex: 60,
  },
  overlayHeader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: c.surface,
  },
  exportBtnActive: {
    backgroundColor: c.text,
  },
  exportBtnPDF: {
    backgroundColor: c.text,
  },
  exportBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: c.mid,
  },
  exportBtnTextActive: {
    color: "#fff",
  },
  overlayHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  overlayTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: c.text,
    fontFamily: "Inter_600SemiBold",
  },
  overlayBody: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 6,
  },
  iconBtn: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  formulaBox: {
    backgroundColor: c.panel,
    borderRadius: 14,
    padding: 18,
    marginBottom: 28,
    overflow: "hidden",
  },
  formulaDivider: {
    height: 1,
    backgroundColor: c.ghost,
    marginVertical: 4,
    opacity: 0.4,
  },
  formulaSymbolic: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: c.faint,
    marginBottom: 8,
  },
  formulaSubstituted: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: c.text,
  },
  sectionLabel: {
    fontSize: 10,
    color: c.faint,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
    fontFamily: "Inter_600SemiBold",
  },
  varRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: c.surface,
  },
  varSymbol: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: c.mid,
    minWidth: 22,
  },
  varName: {
    fontSize: 13,
    color: c.faint,
    flex: 1,
    fontFamily: "Inter_400Regular",
  },
  varValue: {
    fontSize: 13,
    color: c.text,
    fontFamily: "Inter_600SemiBold",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 11,
    gap: 16,
  },
  stepNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: c.ghost,
    minWidth: 18,
    paddingTop: 2,
  },
  stepText: {
    fontSize: 13,
    color: c.mid,
    lineHeight: 21,
    flex: 1,
    fontFamily: "Inter_400Regular",
  },
  note: {
    fontSize: 11,
    color: c.faint,
    fontStyle: "italic",
    marginTop: 14,
    fontFamily: "Inter_400Regular",
  },
  proofBox: {
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginBottom: 8,
  },
  proofBoxOk: {
    backgroundColor: "#F0FAF4",
    borderWidth: 1,
    borderColor: "#C0E8CE",
  },
  proofBoxWarn: {
    backgroundColor: "#FBF8ED",
    borderWidth: 1,
    borderColor: "#E8DCA8",
  },
  proofHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  proofMethod: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  proofMethodOk: { color: "#2A7A4B" },
  proofMethodWarn: { color: "#B07D1A" },
  proofBadge: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  proofBadgeOk: { backgroundColor: "#C0E8CE" },
  proofBadgeWarn: { backgroundColor: "#E8DCA8" },
  proofBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  proofBadgeTextOk: { color: "#1A5C38" },
  proofBadgeTextWarn: { color: "#7A5010" },
  proofDetail: {
    fontSize: 12,
    color: c.mid,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  proofSteps: {
    gap: 6,
    paddingTop: 2,
  },
  resultBar: {
    paddingHorizontal: 28,
    paddingTop: 18,
    backgroundColor: c.panel,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "flex-end",
    gap: 8,
  },
  resultLabel: {
    fontSize: 13,
    color: c.faint,
    fontFamily: "Inter_400Regular",
  },
  resultUnit: {
    fontSize: 18,
    color: c.mid,
    fontFamily: "Inter_500Medium",
    marginLeft: 4,
  },
  resultNum: {
    fontSize: 44,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -1.5,
    lineHeight: 52,
  },
  /* ── Doc sections ── */
  docSection: {
    marginBottom: 28,
  },
  docSecHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
    marginBottom: 10,
  },
  docSecNum: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: c.ghost,
    letterSpacing: 0.5,
  },
  docSecTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: c.faint,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  docSecDivider: {
    height: 1,
    backgroundColor: c.surface,
    marginBottom: 14,
  },
  /* ── ID card ── */
  idCard: {
    backgroundColor: c.panel,
    borderRadius: 14,
    padding: 18,
    marginBottom: 28,
  },
  idCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 10,
  },
  idTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: c.text,
    letterSpacing: -0.3,
    flex: 1,
  },
  idBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: c.surface,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 7,
    flexShrink: 0,
    marginTop: 3,
  },
  idBadgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: c.mid,
  },
  idMeta: {
    flexDirection: "row",
    gap: 20,
    flexWrap: "wrap",
  },
  idMetaItem: {
    gap: 2,
  },
  idMetaLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    color: c.ghost,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  idMetaValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: c.mid,
  },
  idMetaValueMono: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: c.mid,
  },
  /* ── Objetivo / Contextualização ── */
  objetivoHero: {
    marginBottom: 24,
    gap: 6,
  },
  objetivoHeroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  objetivoHeroLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    color: c.ghost,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  objetivoHeroText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
    color: c.text,
    lineHeight: 28,
  },
  /* ── Context ── */
  contextText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: c.mid,
    lineHeight: 21,
  },
  /* ── Formula doc ── */
  formulaDocBox: {
    backgroundColor: c.panel,
    borderRadius: 12,
    padding: 16,
    gap: 10,
    alignItems: "center",
  },
  formulaDocDivider: {
    height: 1,
    backgroundColor: c.surface,
    width: "100%",
  },
  formulaDocSubLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: c.ghost,
    letterSpacing: 0.3,
    alignSelf: "flex-start",
  },
  formulaDocSymbolic: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: c.text,
    textAlign: "center",
  },
  formulaDocSubstituted: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: c.mid,
    textAlign: "center",
  },
  /* ── Variáveis doc ── */
  docVarRow: {
    paddingVertical: 12,
    gap: 3,
  },
  docVarTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  docVarBottom: {
    paddingLeft: 32,
  },
  docVarLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  docVarSymbolBox: {
    minWidth: 26,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  docVarName: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: c.faint,
    flex: 1,
    minWidth: 0,
  },
  docVarPapel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: c.ghost,
    letterSpacing: 0.1,
    lineHeight: 16,
  },
  docVarValueBox: {
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  /* ── Steps doc ── */
  loadingStepsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  loadingStepsText: {
    fontSize: 13,
    color: c.mid,
    fontFamily: "Inter_400Regular",
  },
  docStepRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 14,
    paddingVertical: 2,
  },
  docStepTrack: {
    alignItems: "center",
    width: 10,
    paddingTop: 5,
  },
  docStepDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: c.ghost,
    flexShrink: 0,
  },
  docStepDotResult: {
    backgroundColor: c.text,
  },
  docStepLine: {
    flex: 1,
    width: 1,
    backgroundColor: c.surface,
    marginTop: 4,
    marginBottom: 0,
    minHeight: 12,
  },
  docStepContent: {
    flex: 1,
    gap: 6,
    paddingBottom: 16,
  },
  docStepText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: c.mid,
    lineHeight: 20,
  },
  docStepJustificativa: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: c.ghost,
    fontStyle: "italic",
    lineHeight: 17,
  },
  /* ── Resultado doc ── */
  resultDocCard: {
    backgroundColor: "#F0EFEB",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 2,
  },
  resultDocLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: c.mid,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    marginTop: 4,
  },
  resultDocUnit: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: c.ghost,
    letterSpacing: 0.2,
    lineHeight: 15,
  },
  resultDocNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 36,
    color: c.text,
    letterSpacing: -1.2,
    lineHeight: 42,
  },
  interpretacaoText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: c.ghost,
    lineHeight: 16,
    marginTop: 2,
    fontStyle: "italic",
  },
  /* ── Notes & warnings ── */
  notesWrap: {
    gap: 8,
    marginBottom: 28,
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  warningText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#B07D1A",
    lineHeight: 17,
    flex: 1,
  },
  /* ── Footer ── */
  docFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: c.surface,
    marginTop: 4,
  },
  docFooterText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: c.ghost,
  },
  sessionRow: {
    backgroundColor: c.panel,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowPressed: { backgroundColor: c.surface },
  sessionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
    marginBottom: 3,
  },
  sessionMeta: {
    fontSize: 11,
    color: c.faint,
    fontFamily: "Inter_400Regular",
  },
  searchBox: {
    backgroundColor: c.panel,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sigmaText: {
    fontSize: 14,
    color: c.ghost,
    fontFamily: "Inter_400Regular",
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: c.text,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  catScroll: {
    flexShrink: 0,
    flexGrow: 0,
    height: 40,
    marginBottom: 6,
  },
  catChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: c.panel,
  },
  catChipActive: { backgroundColor: c.text },
  catChipText: {
    fontSize: 12,
    color: c.mid,
    fontFamily: "Inter_500Medium",
  },
  catChipTextActive: { color: "#fff" },
  formulaCard: {
    backgroundColor: c.panel,
    borderRadius: 12,
    padding: 14,
  },
  formulaCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  formulaCat: {
    fontSize: 10,
    color: c.faint,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: "Inter_500Medium",
  },
  formulaName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
    marginTop: 2,
  },
  formulaDesc: {
    fontSize: 12,
    color: c.faint,
    lineHeight: 18,
    marginBottom: 8,
    fontFamily: "Inter_400Regular",
  },
  formulaSymbolicSmall: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: c.mid,
  },
  bookmarkBtn: {
    padding: 5,
    paddingHorizontal: 7,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  bookmarkBtnActive: { backgroundColor: c.text },
  bookmarkPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: c.surface,
  },
  bookmarkPillSaved: {
    backgroundColor: c.text,
  },
  bookmarkPillPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.94 }],
  },
  bookmarkPillText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: c.ghost,
  },
  bookmarkPillTextSaved: {
    color: "#fff",
  },
  centerLoader: {
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    height: 160,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 13,
    color: c.ghost,
    fontFamily: "Inter_400Regular",
  },
  tabRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 10,
  },
  tabBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: c.panel,
  },
  tabBtnActive: {
    backgroundColor: c.text,
  },
  tabBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: c.mid,
  },
  tabBtnTextActive: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
  },
  infoBtn: {
    padding: 5,
    borderRadius: 8,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBadgeOk: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: "#F0FAF4",
  },
  cardBadgeTextOk: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "#2A7A4B",
  },
  cardBadgeWarn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: "#FBF8ED",
  },
  cardBadgeTextWarn: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "#B07D1A",
  },
  cardBadgeCommunity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 5,
    backgroundColor: "#EBF3FB",
  },
  cardBadgeTextCommunity: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: "#3A6B9A",
  },
  /* ── Plans Screen ── */
  plansSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.faint,
    lineHeight: 20,
    marginBottom: 4,
  },
  planCard: {
    backgroundColor: c.panel,
    borderRadius: 20,
    padding: 20,
  },
  planCardHighlight: {
    backgroundColor: c.text,
  },
  planBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#2A7A4B",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 14,
  },
  planBadgeText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.8,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  planName: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -0.3,
  },
  planNameHighlight: {
    color: c.background,
  },
  planPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  planPrice: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -0.5,
  },
  planPriceHighlight: {
    color: c.background,
  },
  planPricePeriod: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.faint,
  },
  planCreditsBox: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 2,
  },
  planCreditsNum: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -0.3,
  },
  planCreditsNumHighlight: {
    color: c.background,
  },
  planCreditsNote: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.faint,
  },
  planDivider: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.06)",
    marginBottom: 16,
  },
  planFeatures: {
    gap: 10,
    marginBottom: 20,
  },
  planFeatureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  planFeatureText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: c.mid,
  },
  planCta: {
    backgroundColor: c.surface,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  planCtaHighlight: {
    backgroundColor: c.background,
  },
  planCtaDisabled: {
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  planCtaText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
  },
  planCtaTextHighlight: {
    color: c.text,
  },
  planCtaTextDisabled: {
    color: c.ghost,
  },
  planDisclaimer: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.ghost,
    textAlign: "center",
    marginTop: 4,
  },
  /* ── Plan Management Screen ── */
  mgmtPlanBadge: {
    backgroundColor: c.panel,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mgmtPlanBadgeLeft: {
    gap: 4,
  },
  mgmtPlanLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: c.ghost,
    letterSpacing: 0.8,
  },
  mgmtPlanName: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -0.4,
  },
  mgmtUpgradeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: c.text,
    borderRadius: 20,
    paddingVertical: 9,
    paddingLeft: 14,
    paddingRight: 10,
  },
  mgmtUpgradeBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: c.background,
  },
  mgmtCard: {
    backgroundColor: c.panel,
    borderRadius: 16,
    padding: 18,
    gap: 6,
  },
  mgmtCardLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: c.ghost,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  mgmtCreditsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  mgmtCreditsNum: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -1,
  },
  mgmtCreditsSuffix: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: c.faint,
  },
  mgmtCreditsNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.faint,
  },
  mgmtProgressBg: {
    height: 6,
    backgroundColor: c.surface,
    borderRadius: 3,
    marginTop: 10,
    overflow: "hidden",
  },
  mgmtProgressFill: {
    height: "100%",
    backgroundColor: c.text,
    borderRadius: 3,
  },
  mgmtProgressLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.ghost,
    marginTop: 4,
  },
  mgmtStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  mgmtStat: {
    flex: 1,
    gap: 3,
  },
  mgmtStatDivider: {
    width: 1,
    height: 36,
    backgroundColor: c.surface,
    marginHorizontal: 16,
  },
  mgmtStatNum: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: c.text,
    letterSpacing: -0.5,
  },
  mgmtStatLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: c.faint,
  },
  mgmtInfoBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: c.panel,
    borderRadius: 12,
    padding: 14,
  },
  mgmtInfoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.faint,
    lineHeight: 18,
  },
  mgmtUpgradeCard: {
    backgroundColor: c.panel,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  mgmtUpgradeCardTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
    marginBottom: 3,
  },
  mgmtUpgradeCardSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: c.faint,
  },
  listDivider: {
    height: 1,
    backgroundColor: c.border,
    marginHorizontal: 16,
  },
});
