import { describe, expect, it } from "vitest";

import { inTextCitation, surnameOf } from "@/server/services/references/cite";

/**
 * The in-text citation form.
 *
 * Handed to the model alongside each retrieved work so it never has to build
 * one from the structured fields — every construction it does itself is a
 * chance to get an author or a year subtly wrong on a real publication.
 */

describe("surnameOf", () => {
  it("takes the last word of a display name", () => {
    expect(surnameOf("Chinelo Okeke")).toBe("Okeke");
    expect(surnameOf("Ngozi Adaeze Eze")).toBe("Eze");
  });

  it("takes what precedes the comma when the name is already inverted", () => {
    // "Okeke, C." must not cite as "(C., 2024)".
    expect(surnameOf("Okeke, C.")).toBe("Okeke");
    expect(surnameOf("van der Berg, A. J.")).toBe("van der Berg");
  });

  it("survives a single name and empty input", () => {
    expect(surnameOf("Plato")).toBe("Plato");
    expect(surnameOf("   ")).toBe("");
  });
});

describe("inTextCitation", () => {
  it("names one author", () => {
    expect(inTextCitation({ authors: ["Chinelo Okeke"], year: "2024" })).toBe("(Okeke, 2024)");
  });

  it("names both of two", () => {
    expect(inTextCitation({ authors: ["Chinelo Okeke", "Musa Bello"], year: "2023" })).toBe(
      "(Okeke & Bello, 2023)",
    );
  });

  it("abbreviates three or more", () => {
    expect(
      inTextCitation({ authors: ["Chinelo Okeke", "Musa Bello", "Ada Nwosu"], year: "2022" }),
    ).toBe("(Okeke et al., 2022)");
  });

  it("returns nothing when there is no usable author or year", () => {
    // Rather than "(Anonymous, n.d.)". A citation form that cannot be used
    // honestly should not be offered at all — supplying one invites its use.
    expect(inTextCitation({ authors: [], year: "2024" })).toBeNull();
    expect(inTextCitation({ authors: ["Chinelo Okeke"], year: null })).toBeNull();
  });
});
