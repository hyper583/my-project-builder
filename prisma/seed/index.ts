/**
 * Development seed data.
 *
 * This file seeds REFERENCE data only — institutions, project types, citation
 * styles and formatting presets. It creates no user accounts and no projects,
 * so it is safe to run against any environment. Demo project fixtures live
 * separately in prisma/seed/demo-project.ts and are created per-user, on
 * request, from the app.
 */
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

import { PrismaClient } from "../../src/generated/prisma/client.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const INSTITUTIONS: Array<{
  name: string;
  country: string;
  city?: string;
  faculties: Array<{ name: string; departments: string[] }>;
}> = [
  {
    name: "Madonna University",
    country: "Nigeria",
    city: "Okija",
    faculties: [
      {
        name: "Faculty of Natural and Applied Sciences",
        departments: ["Computer Science", "Biochemistry", "Microbiology", "Mathematics", "Physics"],
      },
      {
        name: "Faculty of Management and Social Sciences",
        departments: ["Accounting", "Business Administration", "Economics", "Mass Communication"],
      },
      { name: "Faculty of Engineering", departments: ["Electrical Engineering", "Mechanical Engineering", "Civil Engineering"] },
      { name: "Faculty of Medicine and Surgery", departments: ["Medicine and Surgery", "Nursing Science"] },
    ],
  },
  {
    name: "University of Nigeria, Nsukka",
    country: "Nigeria",
    city: "Nsukka",
    faculties: [
      { name: "Faculty of Physical Sciences", departments: ["Computer Science", "Statistics", "Geology"] },
      { name: "Faculty of Social Sciences", departments: ["Psychology", "Political Science", "Sociology and Anthropology"] },
      { name: "Faculty of Engineering", departments: ["Electronic Engineering", "Civil Engineering"] },
    ],
  },
  {
    name: "University of Lagos",
    country: "Nigeria",
    city: "Lagos",
    faculties: [
      { name: "Faculty of Science", departments: ["Computer Sciences", "Chemistry", "Botany"] },
      { name: "Faculty of Management Sciences", departments: ["Accounting", "Finance", "Business Administration"] },
      { name: "Faculty of Engineering", departments: ["Systems Engineering", "Chemical Engineering"] },
    ],
  },
  {
    name: "Ahmadu Bello University",
    country: "Nigeria",
    city: "Zaria",
    faculties: [
      { name: "Faculty of Science", departments: ["Computer Science", "Biological Sciences"] },
      { name: "Faculty of Agriculture", departments: ["Agricultural Economics", "Soil Science"] },
    ],
  },
];

const PROJECT_TYPES = [
  { key: "undergraduate-project", label: "Undergraduate Project", methodologyKey: "general", order: 1 },
  { key: "final-year-project", label: "Final Year Project", methodologyKey: "general", order: 2 },
  { key: "research-project", label: "Research Project", methodologyKey: "general", order: 3 },
  { key: "seminar", label: "Seminar", methodologyKey: "general", order: 4 },
  { key: "thesis", label: "Thesis", methodologyKey: "general", order: 5 },
  { key: "dissertation", label: "Dissertation", methodologyKey: "general", order: 6 },
  { key: "research-paper", label: "Research Paper", methodologyKey: "general", order: 7 },
  { key: "case-study", label: "Case Study", methodologyKey: "business", order: 8 },
  { key: "laboratory-project", label: "Laboratory Project", methodologyKey: "experimental", order: 9 },
  { key: "software-project", label: "Software Project", methodologyKey: "software", order: 10 },
  { key: "other", label: "Other", methodologyKey: "general", order: 11 },
];

const CITATION_STYLES = [
  { key: "apa7", label: "APA 7th edition", order: 1 },
  { key: "mla", label: "MLA", order: 2 },
  { key: "chicago", label: "Chicago", order: 3 },
  { key: "harvard", label: "Harvard", order: 4 },
  { key: "ieee", label: "IEEE", order: 5 },
  { key: "vancouver", label: "Vancouver", order: 6 },
  { key: "other", label: "Other / department specific", order: 7 },
];

const FORMATTING_PRESETS = [
  {
    key: "nigerian-university-standard",
    label: "Nigerian university standard",
    description: "Times New Roman 12pt, double spaced, 1.5in binding margin — the most common requirement.",
    values: {
      font: "Times New Roman",
      fontSize: "12",
      lineSpacing: "2.0",
      paraSpacing: "0",
      margins: "Top 1in, Bottom 1in, Left 1.5in, Right 1in",
      headingStyle: "Bold, title case, chapter headings centred and capitalised",
      pageNumbering: "Roman numerals for preliminary pages, Arabic from Chapter One",
      chapterNumbering: "CHAPTER ONE, CHAPTER TWO (words)",
    },
  },
  {
    key: "apa-student-paper",
    label: "APA 7 student paper",
    description: "Times New Roman 12pt, double spaced, 1in margins throughout.",
    values: {
      font: "Times New Roman",
      fontSize: "12",
      lineSpacing: "2.0",
      paraSpacing: "0",
      margins: "1in all sides",
      headingStyle: "APA 7 five-level heading system",
      pageNumbering: "Arabic, top right, from the title page",
      chapterNumbering: "Numeric (1, 2, 3)",
    },
  },
  {
    key: "ieee-technical",
    label: "IEEE technical report",
    description: "Times New Roman 10pt, single spaced, numbered sections.",
    values: {
      font: "Times New Roman",
      fontSize: "10",
      lineSpacing: "1.0",
      paraSpacing: "6pt after",
      margins: "1in all sides",
      headingStyle: "Numbered sections (I, II, III)",
      pageNumbering: "Arabic, bottom centre",
      chapterNumbering: "Roman numerals",
    },
  },
];

async function main() {
  console.info("Seeding reference data…");

  for (const inst of INSTITUTIONS) {
    const institution = await prisma.institution.upsert({
      where: { name: inst.name },
      update: { country: inst.country, city: inst.city },
      create: { name: inst.name, country: inst.country, city: inst.city },
    });

    for (const fac of inst.faculties) {
      const faculty = await prisma.faculty.upsert({
        where: { institutionId_name: { institutionId: institution.id, name: fac.name } },
        update: {},
        create: { institutionId: institution.id, name: fac.name },
      });

      for (const dept of fac.departments) {
        await prisma.department.upsert({
          where: { facultyId_name: { facultyId: faculty.id, name: dept } },
          update: {},
          create: { facultyId: faculty.id, name: dept },
        });
      }
    }
  }

  for (const type of PROJECT_TYPES) {
    await prisma.projectTypeDef.upsert({
      where: { key: type.key },
      update: { label: type.label, methodologyKey: type.methodologyKey, order: type.order },
      create: type,
    });
  }

  for (const style of CITATION_STYLES) {
    await prisma.citationStyle.upsert({
      where: { key: style.key },
      update: { label: style.label, order: style.order },
      create: style,
    });
  }

  for (const preset of FORMATTING_PRESETS) {
    await prisma.formattingPreset.upsert({
      where: { key: preset.key },
      update: { label: preset.label, description: preset.description, values: preset.values },
      create: preset,
    });
  }

  const counts = {
    institutions: await prisma.institution.count(),
    faculties: await prisma.faculty.count(),
    departments: await prisma.department.count(),
    projectTypes: await prisma.projectTypeDef.count(),
    citationStyles: await prisma.citationStyle.count(),
    formattingPresets: await prisma.formattingPreset.count(),
  };
  console.info("Seed complete:", counts);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
