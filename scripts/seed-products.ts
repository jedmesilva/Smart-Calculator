/**
 * Cria produtos e preços da Phormula no Stripe.
 * 
 * Uso: STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/seed-products.ts
 * 
 * Idempotente — verifica se os produtos já existem antes de criar.
 */
import { getUncachableStripeClient } from "./stripeClient";

const PLANS = [
  {
    name: "Starter",
    description: "500 créditos por mês para cálculos com IA",
    planId: "starter",
    credits: 500,
    priceBRL: 1990, // R$19,90 em centavos
  },
  {
    name: "Pro",
    description: "2.000 créditos por mês — para uso intensivo",
    planId: "pro",
    credits: 2000,
    priceBRL: 5990, // R$59,90 em centavos
  },
];

async function createProducts() {
  const stripe = await getUncachableStripeClient();
  console.log("Criando produtos Phormula no Stripe...\n");

  for (const plan of PLANS) {
    // Verifica se o produto já existe
    const existing = await stripe.products.search({
      query: `metadata['plan_id']:'${plan.planId}'`,
    });

    if (existing.data.length > 0) {
      const prod = existing.data[0];
      const prices = await stripe.prices.list({ product: prod.id, active: true });
      console.log(`✓ ${plan.name} já existe (${prod.id})`);
      prices.data.forEach((p) => {
        console.log(`  Preço: R$${(p.unit_amount! / 100).toFixed(2)}/mês → ${p.id}`);
      });
      continue;
    }

    // Cria produto
    const product = await stripe.products.create({
      name: `Phormula ${plan.name}`,
      description: plan.description,
      metadata: {
        plan_id: plan.planId,
        credits: String(plan.credits),
      },
    });
    console.log(`✓ Produto criado: ${product.name} (${product.id})`);

    // Cria preço mensal em BRL
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.priceBRL,
      currency: "brl",
      recurring: { interval: "month" },
      metadata: {
        plan_id: plan.planId,
      },
    });
    console.log(`  Preço criado: R$${(price.unit_amount! / 100).toFixed(2)}/mês → ${price.id}`);
  }

  console.log("\n✅ Produtos criados. Webhooks sincronizarão automaticamente com o banco.");
}

createProducts().catch((err) => {
  console.error("Erro:", err.message);
  process.exit(1);
});
