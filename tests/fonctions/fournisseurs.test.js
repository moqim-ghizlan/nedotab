import { describe, expect, it, vi } from "vitest";
import {
  appelJson,
  codeErreur,
  ErreurFournisseur,
} from "../../functions/src/ia/fournisseurs/commun.js";
import * as openai from "../../functions/src/ia/fournisseurs/openai.js";
import * as gemini from "../../functions/src/ia/fournisseurs/gemini.js";

const reponse = (status, corps) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corps,
});

describe("codeErreur", () => {
  it.each([
    [401, {}, "cle-invalide"],
    [403, {}, "cle-invalide"],
    [
      400,
      { error: { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } },
      "cle-invalide",
    ],
    [402, {}, "cle-sans-credit"],
    [429, { error: { code: "insufficient_quota" } }, "cle-sans-credit"],
    [429, { error: { code: "rate_limit_exceeded" } }, "limite-fournisseur"],
    [400, { error: { message: "bad" } }, "requete-invalide"],
    [500, {}, "fournisseur-indisponible"],
    [503, {}, "fournisseur-indisponible"],
  ])("%i → %s", (statut, corps, code) => {
    expect(codeErreur(statut, corps)).toBe(code);
  });
});

describe("appelJson", () => {
  it("un seul réessai sur une erreur serveur", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(reponse(503, {}))
      .mockResolvedValueOnce(reponse(200, { a: 1 }));
    await expect(appelJson("u", {}, { fetch: f })).resolves.toEqual({ a: 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("pas de réessai sur une erreur 4xx", async () => {
    const f = vi.fn().mockResolvedValue(reponse(401, {}));
    await expect(appelJson("u", {}, { fetch: f })).rejects.toMatchObject({ code: "cle-invalide" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("deux erreurs serveur : indisponible", async () => {
    const f = vi.fn().mockResolvedValue(reponse(500, {}));
    await expect(appelJson("u", {}, { fetch: f })).rejects.toMatchObject({
      code: "fournisseur-indisponible",
    });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("délai dépassé : annulé, réessayé une fois, puis indisponible", async () => {
    const f = vi.fn(
      (_url, { signal }) =>
        new Promise((_ok, ko) => signal.addEventListener("abort", () => ko(new Error("abort")))),
    );
    await expect(appelJson("u", {}, { fetch: f, delai: 20 })).rejects.toMatchObject({
      code: "fournisseur-indisponible",
    });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("l'erreur ne contient ni la clé ni l'en-tête", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(reponse(401, { error: { message: "Incorrect API key sk-secret-123" } }));
    const e = await appelJson(
      "u",
      { headers: { authorization: "Bearer sk-secret-123" } },
      { fetch: f },
    ).catch((x) => x);
    expect(e).toBeInstanceOf(ErreurFournisseur);
    expect(`${e.message} ${JSON.stringify(e)}`).not.toContain("sk-secret");
  });
});

describe("adaptateur OpenAI", () => {
  it("envoie une requête Chat Completions conforme et lit la réponse", async () => {
    const f = vi.fn().mockResolvedValue(
      reponse(200, {
        model: "modele-test-2026",
        choices: [{ message: { role: "assistant", content: "OK" } }],
        usage: { prompt_tokens: 12, completion_tokens: 1 },
      }),
    );
    const r = await openai.envoyer(
      {
        cle: "sk-abcdefghijklmnopqrstuvwx",
        modele: "modele-test",
        systeme: "Tu es concis.",
        messages: [{ role: "user", texte: "Bonjour" }],
        maxJetons: 50,
        formatJson: true,
      },
      { fetch: f },
    );
    expect(r).toEqual({
      texte: "OK",
      jetonsEntree: 12,
      jetonsSortie: 1,
      modele: "modele-test-2026",
    });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer sk-abcdefghijklmnopqrstuvwx");
    const corps = JSON.parse(init.body);
    expect(corps).toEqual({
      model: "modele-test",
      messages: [
        { role: "system", content: "Tu es concis." },
        { role: "user", content: "Bonjour" },
      ],
      max_completion_tokens: 50,
      response_format: { type: "json_object" },
    });
    expect(corps).not.toHaveProperty("max_tokens");
    expect(corps).not.toHaveProperty("temperature");
  });

  it("vérifie la clé par la liste des modèles", async () => {
    const f = vi.fn().mockResolvedValue(reponse(200, { data: [] }));
    expect(await openai.verifierCle({ cle: "sk-abcdefghijklmnopqrstuvwx" }, { fetch: f })).toEqual({
      valide: true,
    });
    expect(f.mock.calls[0][0]).toBe("https://api.openai.com/v1/models");
    f.mockResolvedValue(reponse(401, {}));
    expect(await openai.verifierCle({ cle: "sk-abcdefghijklmnopqrstuvwx" }, { fetch: f })).toEqual({
      valide: false,
      raison: "cle-invalide",
    });
  });

  it("format de clé tolérant", () => {
    expect(openai.formatCle.test("sk-proj-AbC_123-xyz7890abcdefgh")).toBe(true);
    expect(openai.formatCle.test("pas une clé")).toBe(false);
  });
});

describe("adaptateur Gemini", () => {
  const cle = "AIzaSyExempleDeCleGeminiTresLongue1234";

  it("envoie une requête generateContent conforme et lit la réponse", async () => {
    const f = vi.fn().mockResolvedValue(
      reponse(200, {
        modelVersion: "modele-test-2026",
        candidates: [{ content: { parts: [{ text: "O" }, { text: "K" }] } }],
        usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 2 },
      }),
    );
    const r = await gemini.envoyer(
      {
        cle,
        modele: "models/modele-test",
        systeme: "Tu es concis.",
        messages: [
          { role: "user", texte: "Bonjour" },
          { role: "assistant", texte: "Salut" },
          { role: "user", texte: "Ça va ?" },
        ],
        maxJetons: 50,
        temperature: 0.2,
        formatJson: true,
      },
      { fetch: f },
    );
    expect(r).toEqual({
      texte: "OK",
      jetonsEntree: 9,
      jetonsSortie: 2,
      modele: "modele-test-2026",
    });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/modele-test:generateContent",
    );
    expect(url).not.toContain(cle);
    expect(init.headers["x-goog-api-key"]).toBe(cle);
    expect(JSON.parse(init.body)).toEqual({
      contents: [
        { role: "user", parts: [{ text: "Bonjour" }] },
        { role: "model", parts: [{ text: "Salut" }] },
        { role: "user", parts: [{ text: "Ça va ?" }] },
      ],
      systemInstruction: { parts: [{ text: "Tu es concis." }] },
      generationConfig: {
        maxOutputTokens: 50,
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });
  });

  it("sans option : pas de generationConfig ni de systemInstruction", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(reponse(200, { candidates: [{ content: { parts: [{ text: "x" }] } }] }));
    await gemini.envoyer(
      { cle, modele: "m", messages: [{ role: "user", texte: "a" }] },
      { fetch: f },
    );
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      contents: [{ role: "user", parts: [{ text: "a" }] }],
    });
  });

  it("prompt bloqué ou réponse vide : erreur normalisée", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(reponse(200, { promptFeedback: { blockReason: "SAFETY" } }));
    await expect(
      gemini.envoyer({ cle, modele: "m", messages: [{ role: "user", texte: "a" }] }, { fetch: f }),
    ).rejects.toMatchObject({ code: "requete-invalide" });
  });

  it("vérifie la clé par la liste des modèles (400 API_KEY_INVALID = invalide)", async () => {
    const f = vi.fn().mockResolvedValue(reponse(200, { models: [] }));
    expect(await gemini.verifierCle({ cle }, { fetch: f })).toEqual({ valide: true });
    expect(f.mock.calls[0][0]).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
    );
    f.mockResolvedValue(
      reponse(400, {
        error: { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] },
      }),
    );
    expect(await gemini.verifierCle({ cle }, { fetch: f })).toEqual({
      valide: false,
      raison: "cle-invalide",
    });
  });

  it("format de clé tolérant : anciennes clés, clés récentes avec un point", () => {
    expect(gemini.formatCle.test(cle)).toBe(true);
    expect(gemini.formatCle.test("AQ.Ab8RN6Exemple-de_cle.recente1234567")).toBe(true);
    expect(gemini.formatCle.test("trop court")).toBe(false);
    expect(gemini.formatCle.test("deux mots dans une phrase collee")).toBe(false);
  });
});
