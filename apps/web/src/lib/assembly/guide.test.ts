import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { namePattern, parseGuide, parseGuideJson, stepForNames } from "./guide.ts";

const md = readFileSync(new URL("../../../public/examples/cubesat-basico.md", import.meta.url), "utf8");

test("markdown de ejemplo: título, piezas y pasos", () => {
  const g = parseGuide(md, "guia.md");
  assert.equal(g.title, "CubeSat básico 1U");
  assert.equal(g.parts.length, 9);
  assert.deepEqual(g.parts[7], { id: "paneles", label: "Panel solar", qty: 4 });
  assert.equal(g.steps.length, 8);
  assert.equal(g.steps[0].title, "Preparar la estructura");
  assert.deepEqual(g.steps[0].meshes, ["Riel_*", "Marco_Inferior"]);
  assert.deepEqual(g.steps[0].parts, ["estructura", "tornillos"]);
  assert.match(g.steps[0].concept, /^los rieles/);
  assert.match(g.steps[0].body, /^Une los cuatro rieles/);
});

test("json con alias y valores por defecto", () => {
  const g = parseGuideJson('{"steps":[{"instructions":"x","meshes":"A, B*"}],"parts":[{"name":"Tornillo","qty":"4"}]}');
  assert.equal(g.title, "Mi proyecto");
  assert.deepEqual(g.steps[0], { title: "Paso 1", body: "x", concept: "", parts: [], meshes: ["A", "B*"] });
  assert.deepEqual(g.parts[0], { id: "pieza-1", label: "Tornillo", qty: 4 });
});

test("errores claros", () => {
  assert.throws(() => parseGuideJson("{"), /no es válido/);
  assert.throws(() => parseGuide("# Solo título", "g.md"), /no tiene pasos/);
});

test("patrones de nombre y paso de cada objeto", () => {
  assert.ok(namePattern("Riel_*")("riel_3"));
  assert.ok(!namePattern("Riel_*")("Marco"));
  assert.ok(!namePattern("a.b")("axb"));
  const g = parseGuide(md, "g.md");
  assert.equal(stepForNames(g, ["Panel_XP"]), 7);
  assert.equal(stepForNames(g, ["Cubo", "OBC_Chip"]), 3);
  assert.equal(stepForNames(g, ["Otro"]), -1);
});
