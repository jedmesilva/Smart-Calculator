import { pgTable, text, boolean, timestamp, uuid, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  full_name: text("full_name"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const formulas = pgTable("formulas", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  symbolic: text("symbolic").notNull(),
  is_system: boolean("is_system").default(false).notNull(),
  is_public: boolean("is_public").default(false).notNull(),
  user_id: text("user_id"),
  expression: text("expression"),
  expression_meta: jsonb("expression_meta"),
  llm_verdict: text("llm_verdict"),
  llm_verified_at: timestamp("llm_verified_at"),
  llm_verdict_detail: text("llm_verdict_detail"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const savedFormulas = pgTable("saved_formulas", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id").notNull(),
  formula_id: uuid("formula_id").notNull().references(() => formulas.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  summary_message_count: integer("summary_message_count"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  session_id: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  text: text("text"),
  result_data: jsonb("result_data"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const formulaVerifications = pgTable("formula_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  formula_id: uuid("formula_id").notNull().references(() => formulas.id, { onDelete: "cascade" }),
  user_id: text("user_id").notNull(),
  verdict: text("verdict").notNull(),
  detail: text("detail"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const formulaNotes = pgTable("formula_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  formula_id: uuid("formula_id").notNull().references(() => formulas.id, { onDelete: "cascade" }),
  user_id: text("user_id").notNull(),
  content: text("content").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFormulaSchema = createInsertSchema(formulas).omit({ id: true, created_at: true });
export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, created_at: true, updated_at: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, created_at: true });

export type Profile = typeof profiles.$inferSelect;
export type Formula = typeof formulas.$inferSelect;
export type SavedFormula = typeof savedFormulas.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type FormulaVerification = typeof formulaVerifications.$inferSelect;
export type FormulaNote = typeof formulaNotes.$inferSelect;
export type InsertFormula = z.infer<typeof insertFormulaSchema>;
