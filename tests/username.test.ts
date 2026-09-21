/**
 * Username login identity regressions.
 *
 * Employees sign in with a username while the e-mail stays on the Firebase identity for recovery. These
 * tests pin the generator (including the punctuation cases that used to produce inconsistent names), the
 * collision handling, and the fact that recovery never discloses a full address.
 */

import assert from "node:assert/strict";
import test, { describe } from "node:test";

import {
  USERNAME_PATTERN,
  foldNameFragment,
  generateUsername,
  isValidUsername,
  maskEmail,
  normalizeUsername,
  splitLegalName,
  usernameCandidate,
  usernameCandidateFromFullName,
  usernameProblem,
} from "../lib/username";

describe("username generation", () => {
  test("uses first initial + last name, lowercased", () => {
    assert.equal(usernameCandidate("John", "Smith"), "jsmith");
    assert.equal(usernameCandidate("Maria", "Gonzalez"), "mgonzalez");
    assert.equal(usernameCandidateFromFullName("John Smith"), "jsmith");
    assert.equal(usernameCandidateFromFullName("Maria Gonzalez"), "mgonzalez");
  });

  test("punctuation, spacing, and capitalization cannot produce different account names", () => {
    assert.equal(usernameCandidate("Sean", "O'Connor"), "soconnor");
    assert.equal(usernameCandidate("SEAN", "OCONNOR"), "soconnor");
    assert.equal(usernameCandidate("sean", "o connor"), "soconnor");
    assert.equal(usernameCandidate("Alex", "Smith-Jones"), "asmithjones");
    assert.equal(usernameCandidate("Alex", "Smith Jones"), "asmithjones");
    assert.equal(usernameCandidate("  Alex  ", " Smith-Jones "), "asmithjones");
    assert.equal(usernameCandidate("José", "Muñoz"), "jmunoz", "accents fold rather than dropping letters");
    assert.equal(usernameCandidate("Renée", "D'Angelo-Pérez"), "rdangeloperez");
  });

  test("a multi-word surname stays one fragment and a generational suffix is ignored", () => {
    assert.deepEqual(splitLegalName("Maria Del Rio"), { firstName: "maria", lastName: "delrio" });
    assert.equal(usernameCandidateFromFullName("Maria Del Rio"), "mdelrio");
    assert.equal(usernameCandidateFromFullName("John Smith Jr"), "jsmith");
    assert.equal(usernameCandidateFromFullName("John Smith III"), "jsmith");
  });

  test("a single-word name uses the whole name rather than one letter", () => {
    assert.equal(usernameCandidateFromFullName("Cher"), "cher");
    assert.deepEqual(splitLegalName("Cher"), { firstName: "cher", lastName: "" });
  });

  test("an unusable name produces nothing instead of a broken username", () => {
    assert.equal(usernameCandidateFromFullName("   "), "");
    assert.equal(usernameCandidateFromFullName("!!! ???"), "");
    assert.equal(generateUsername("", "", []), "");
    assert.equal(foldNameFragment("O'Con-nor"), "oconnor");
  });
});

describe("username collisions", () => {
  test("a taken name gets the next free numeric suffix", () => {
    assert.equal(generateUsername("John", "Smith", []), "jsmith");
    assert.equal(generateUsername("Jane", "Smith", ["jsmith"]), "jsmith2");
    assert.equal(generateUsername("Jill", "Smith", ["jsmith", "jsmith2"]), "jsmith3");
    assert.equal(generateUsername("Jack", "Smith", ["jsmith", "jsmith2", "jsmith3"]), "jsmith4");
  });

  test("suffixes skip gaps rather than reusing a retired name out of order", () => {
    assert.equal(generateUsername("Jane", "Smith", ["jsmith", "jsmith3"]), "jsmith2");
  });

  test("collision handling accepts a live lookup as well as a list", () => {
    const taken = new Set(["jsmith", "jsmith2"]);
    assert.equal(generateUsername("John", "Smith", (candidate) => taken.has(candidate)), "jsmith3");
  });

  test("a long surname is truncated so the suffix cannot collide with the unsuffixed name", () => {
    const long = "abcdefghijklmnopqrstuvwxyzabcdefghij";
    const base = generateUsername("Xavier", long, []);
    assert.equal(base.length, 32);
    const next = generateUsername("Xander", long, [base]);
    assert.equal(next.length, 32);
    assert.notEqual(next, base);
    assert.ok(next.endsWith("2"));
  });

  test("comparison is case and punctuation insensitive, so a duplicate cannot slip through", () => {
    assert.equal(generateUsername("John", "Smith", ["JSMITH"]), "jsmith2");
    assert.equal(normalizeUsername("  JSmith "), "jsmith");
    assert.equal(normalizeUsername("j.smith-1"), "jsmith1");
  });
});

describe("username validation", () => {
  test("accepts the generated shape and rejects anything else", () => {
    for (const value of ["jsmith", "jsmith2", "mgonzalez", "soconnor"]) {
      assert.equal(usernameProblem(value), null, `${value} must be valid`);
      assert.ok(USERNAME_PATTERN.test(value));
      assert.equal(isValidUsername(value), true);
    }
    assert.ok(usernameProblem(""), "an empty username is refused");
    assert.ok(usernameProblem("j"), "a single character is refused");
    assert.ok(usernameProblem("2smith"), "a username may not start with a digit");
    assert.ok(usernameProblem("j smith"), "spaces are refused rather than silently stripped");
    assert.ok(usernameProblem("j.smith"), "punctuation is refused rather than silently stripped");
    // Capitalization is a typing habit, not a different account: it is folded instead of refused.
    assert.equal(usernameProblem("JSmith"), null);
    assert.equal(normalizeUsername("JSmith"), "jsmith");
  });
});

describe("recovery never discloses an address", () => {
  test("only the first character and the domain suffix survive masking", () => {
    assert.equal(maskEmail("maria.gonzalez@gmail.com"), "m***@g***.com");
    assert.equal(maskEmail("JSMITH@Momentum-DCI.com"), "j***@m***.com");
    assert.equal(maskEmail("a@b.co"), "a***@b***.co");
  });

  test("a malformed address masks to nothing rather than leaking what was stored", () => {
    assert.equal(maskEmail(""), "***");
    assert.equal(maskEmail("not-an-email"), "***");
    assert.equal(maskEmail("@nolocal.com"), "***");
  });

  test("the masked form never contains the local part or the full domain", () => {
    const masked = maskEmail("maria.gonzalez@gmail.com");
    assert.ok(!masked.includes("maria"));
    assert.ok(!masked.includes("gonzalez"));
    assert.ok(!masked.includes("gmail"));
  });
});
