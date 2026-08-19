/**
 * The seeded sample project.
 *
 * This fixture is DEMONSTRATION CONTENT. Its findings, percentages, respondent
 * counts and correlation figures are invented to show what a finished project
 * looks like — they describe no real study and no real participants.
 *
 * It is only ever attached to a project with `kind = DEMO`, which the database
 * refuses to change (see migration 20260819100000_project_kind_immutable), and
 * which the export pipeline requires a disclaimer for. It needs no AI provider,
 * so the product is explorable from a fresh install.
 */

export const DEMO_MARKER = "[ILLUSTRATIVE SAMPLE DATA]";

export const demoFixture = {
  title: "Sample Project — Social Media Use and Academic Performance",
  topic:
    "The Effect of Social Media Usage on the Academic Performance of Undergraduate Students in South-East Nigeria",
  topicApproved: "YES" as const,
  researchArea: "Educational Technology and Student Behaviour",
  keywords: ["social media", "academic performance", "undergraduates", "screen time", "CGPA"],
  description:
    "A sample project showing how My Project Builder organises a completed undergraduate study. " +
    "Every figure in it is illustrative and describes no real research.",
  projectType: "undergraduate-project",

  institution: {
    institution: "Madonna University",
    campus: "Okija Campus",
    faculty: "Faculty of Natural and Applied Sciences",
    department: "Computer Science",
    programme: "B.Sc. Computer Science",
    degree: "Bachelor of Science",
    academicLevel: "400 Level",
  },

  research: {
    researchProblem:
      "Undergraduate students report spending increasing amounts of time on social media, yet " +
      "departments have little evidence about whether, and how, that time relates to academic " +
      "outcomes. Without local evidence, academic advisers cannot give students grounded guidance.",
    aim:
      "To examine the relationship between social media usage and the academic performance of " +
      "undergraduate students in South-East Nigeria.",
    objectives: [
      "To determine the average daily time undergraduate students spend on social media.",
      "To examine the relationship between daily social media use and cumulative grade point average.",
      "To identify which platforms students most associate with academic distraction.",
      "To assess whether the relationship differs between academic levels.",
    ],
    researchQuestions: [
      "How much time do undergraduate students spend on social media each day?",
      "What relationship exists between daily social media use and cumulative grade point average?",
      "Which platforms do students most associate with academic distraction?",
      "Does the relationship between usage and performance differ across academic levels?",
    ],
    hypotheses: [
      "H01: There is no significant relationship between daily social media usage and cumulative grade point average.",
      "H02: There is no significant difference in the usage–performance relationship across academic levels.",
    ],
    studyLocation: "Madonna University, Okija Campus, Anambra State",
    targetPopulation: "Undergraduate students of the Faculty of Natural and Applied Sciences",
    samplePopulation: "Students in 200 to 400 level of the Department of Computer Science",
    sampleSize: "127",
    samplingTechnique: "Stratified random sampling, stratified by academic level",
    researchDesign: "Descriptive survey design",
    dataCollectionMethod: "Self-administered structured questionnaire",
    researchInstruments:
      "A 24-item structured questionnaire covering demographics, daily usage, platform preference and self-reported CGPA",
    dataAnalysisMethod:
      "Descriptive statistics for research questions; Pearson product-moment correlation for H01; one-way ANOVA for H02",
    theoreticalFramework:
      "Uses and Gratifications Theory (Katz, Blumler and Gurevitch), which frames media consumption as an active choice made to satisfy particular needs.",
    conceptualFramework:
      "Social media usage (independent variable) is modelled as acting on academic performance (dependent variable), moderated by academic level and study habits.",
    scope:
      "The study covers undergraduate students of one department at one institution during a single academic session.",
    limitations:
      "Academic performance is self-reported rather than drawn from official records, and the single-institution sample limits generalisation.",
    keyTerminology:
      "Social media usage — self-reported time spent on social platforms per day.\n" +
      "Academic performance — cumulative grade point average on a 5.0 scale.\n" +
      "Undergraduate — a student enrolled on a first-degree programme.",
  },

  methodology: {
    type: "questionnaire",
    data: {
      targetRespondents: "Undergraduate Computer Science students in 200–400 level",
      questionnaireType: "Structured, closed-ended",
      sections: [
        "Section A — Demographic information",
        "Section B — Social media usage patterns",
        "Section C — Perceived academic distraction",
        "Section D — Self-reported academic performance",
      ],
      responseScale: "5-point Likert scale (Strongly Agree to Strongly Disagree)",
      distributionMethod: "Distributed in person during lectures, with an online form as an alternative",
      validityReliability:
        "Face and content validity established by two lecturers in the department. " +
        `Reliability reported as Cronbach's alpha of 0.81. ${DEMO_MARKER}`,
    },
  },

  formatting: {
    citationStyle: "apa7",
    font: "Times New Roman",
    fontSize: "12",
    lineSpacing: "2.0",
    paraSpacing: "0",
    margins: "Top 1in, Bottom 1in, Left 1.5in, Right 1in",
    headingStyle: "Chapter headings centred and capitalised; sub-headings bold, title case",
    pageNumbering: "Roman numerals for preliminary pages, Arabic from Chapter One",
    chapterNumbering: "CHAPTER ONE, CHAPTER TWO (words)",
  },

  chapters: [
    {
      number: "1",
      title: "Introduction",
      sections: [
        {
          number: "1.1",
          title: "Background to the Study",
          content:
            "Social media has become a routine part of undergraduate life. Platforms that were once " +
            "used mainly for social contact are now also where students coordinate group work, share " +
            "materials and follow departmental announcements. This dual role — both distraction and " +
            "academic tool — makes the relationship between usage and performance difficult to assume " +
            "in either direction.\n\n" +
            "Existing studies report mixed findings, and few draw on data from South-East Nigerian " +
            "institutions specifically. This study addresses that gap by examining usage and " +
            "performance among undergraduates at a single institution.",
        },
        {
          number: "1.2",
          title: "Statement of the Problem",
          content:
            "Academic advisers are frequently asked whether students should reduce their time on " +
            "social media, but have no local evidence on which to base an answer. Guidance is " +
            "therefore given on intuition rather than measurement, and students receive inconsistent " +
            "advice depending on whom they ask.",
        },
        {
          number: "1.3",
          title: "Aim and Objectives",
          content:
            "The aim of this study is to examine the relationship between social media usage and the " +
            "academic performance of undergraduate students in South-East Nigeria.\n\n" +
            "The specific objectives are to determine average daily usage, to examine its relationship " +
            "with cumulative grade point average, to identify the platforms most associated with " +
            "distraction, and to assess whether that relationship differs by academic level.",
        },
        {
          number: "1.4",
          title: "Research Questions",
          content:
            "1. How much time do undergraduate students spend on social media each day?\n" +
            "2. What relationship exists between daily social media use and cumulative grade point average?\n" +
            "3. Which platforms do students most associate with academic distraction?\n" +
            "4. Does the relationship differ across academic levels?",
        },
        {
          number: "1.5",
          title: "Significance of the Study",
          content:
            "Findings from this study are intended to inform academic advising within the department, " +
            "to give students an evidence-based basis for managing their own study time, and to " +
            "provide a local reference point for subsequent research.",
        },
        {
          number: "1.6",
          title: "Scope and Limitations of the Study",
          content:
            "The study covers undergraduate students of the Department of Computer Science at Madonna " +
            "University during one academic session. Academic performance is self-reported, and the " +
            "single-institution sample limits how far the findings generalise.",
        },
        {
          number: "1.7",
          title: "Definition of Terms",
          content:
            "Social media usage — self-reported time spent on social platforms per day.\n" +
            "Academic performance — cumulative grade point average on a 5.0 scale.\n" +
            "Undergraduate — a student enrolled on a first-degree programme.",
        },
      ],
    },
    {
      number: "2",
      title: "Literature Review",
      sections: [
        {
          number: "2.1",
          title: "Conceptual Framework",
          content:
            "This study treats social media usage as the independent variable and academic performance " +
            "as the dependent variable, with academic level and existing study habits as moderating " +
            "factors. Usage is conceptualised as duration rather than frequency, on the basis that " +
            "sustained sessions displace study time more than brief repeated checks.",
        },
        {
          number: "2.2",
          title: "Theoretical Framework",
          content:
            "The study is anchored in Uses and Gratifications Theory, which holds that media consumers " +
            "actively select media to satisfy particular needs rather than passively receiving it. " +
            "Applied here, the theory suggests that students who use social media for academic " +
            "coordination may experience different outcomes from those using it primarily for " +
            "entertainment, even at similar durations.",
        },
        {
          number: "2.3",
          title: "Empirical Review",
          content:
            "Prior studies report inconsistent results. Some find a negative association between " +
            "heavy usage and grades, others find no significant relationship once study hours are " +
            "controlled for, and a smaller number report positive associations where platforms are " +
            "used for collaboration.\n\n" +
            "This chapter would normally review those studies in detail with full citations. In this " +
            "sample the review is abbreviated, and references are shown for illustration only.",
        },
        {
          number: "2.4",
          title: "Summary of Literature Reviewed",
          content:
            "The literature does not support a single settled conclusion. The disagreement appears to " +
            "turn on how usage is measured and whether purpose of use is distinguished from duration — " +
            "which is why this study measures both.",
        },
      ],
    },
    {
      number: "3",
      title: "Research Methodology",
      sections: [
        {
          number: "3.1",
          title: "Research Design",
          content:
            "The study adopts a descriptive survey design, appropriate because it seeks to describe " +
            "existing patterns of usage and performance without manipulating any variable.",
        },
        {
          number: "3.2",
          title: "Population of the Study",
          content:
            "The population comprises undergraduate students of the Faculty of Natural and Applied " +
            "Sciences, Madonna University, Okija Campus.",
        },
        {
          number: "3.3",
          title: "Sample Size and Sampling Technique",
          content:
            "A sample of 127 respondents was drawn using stratified random sampling, with academic " +
            "level as the stratifying variable. This ensures each of 200, 300 and 400 level is " +
            "represented in proportion to its size in the population.",
        },
        {
          number: "3.4",
          title: "Instrumentation",
          content:
            "Data was collected using a 24-item structured questionnaire in four sections covering " +
            "demographics, usage patterns, perceived distraction and self-reported performance. " +
            "Responses use a 5-point Likert scale.",
        },
        {
          number: "3.5",
          title: "Validity and Reliability of the Instrument",
          content:
            `Face and content validity were established by two lecturers in the department. A pilot ` +
            `study produced a Cronbach's alpha of 0.81, indicating acceptable internal consistency. ` +
            `${DEMO_MARKER}`,
        },
        {
          number: "3.6",
          title: "Method of Data Analysis",
          content:
            "Research questions were answered using descriptive statistics — frequencies, percentages " +
            "and means. Hypothesis one was tested using Pearson product-moment correlation and " +
            "hypothesis two using one-way ANOVA, both at the 0.05 level of significance.",
        },
      ],
    },
    {
      number: "4",
      title: "Data Presentation, Analysis and Interpretation",
      sections: [
        {
          number: "4.1",
          title: "Response Rate",
          content:
            `Of 127 questionnaires distributed, 119 were returned and usable, giving a response rate ` +
            `of 93.7 per cent. ${DEMO_MARKER}`,
        },
        {
          number: "4.2",
          title: "Analysis of Research Questions",
          content:
            `Respondents reported a mean daily social media use of 4.2 hours (SD = 1.6). Usage was ` +
            `highest at 200 level (mean 4.8 hours) and lowest at 400 level (mean 3.5 hours). Asked ` +
            `which platform they most associated with academic distraction, 41 per cent named ` +
            `short-form video, 28 per cent instant messaging and 19 per cent image-sharing platforms.\n\n` +
            `${DEMO_MARKER} These figures are invented for demonstration and describe no real survey.`,
        },
        {
          number: "4.3",
          title: "Test of Hypotheses",
          content:
            `Pearson correlation between daily usage and cumulative grade point average returned ` +
            `r = -0.34 (p = 0.002), so H01 was rejected: a weak but statistically significant negative ` +
            `relationship was observed. One-way ANOVA across academic levels returned F(2, 116) = 3.91 ` +
            `(p = 0.023), so H02 was also rejected.\n\n` +
            `${DEMO_MARKER} These statistics are illustrative only.`,
        },
        {
          number: "4.4",
          title: "Discussion of Findings",
          content:
            "The observed negative relationship is consistent with studies reporting displacement of " +
            "study time, but its weakness suggests usage duration alone explains little of the " +
            "variation in performance. The difference across levels may reflect changing academic " +
            "demands rather than changing habits.",
        },
      ],
    },
    {
      number: "5",
      title: "Summary, Conclusion and Recommendations",
      sections: [
        {
          number: "5.1",
          title: "Summary of Findings",
          content:
            `Students reported a mean of 4.2 hours of daily social media use. A weak negative ` +
            `relationship with academic performance was observed (r = -0.34), and that relationship ` +
            `differed significantly across academic levels. ${DEMO_MARKER}`,
        },
        {
          number: "5.2",
          title: "Conclusion",
          content:
            "Within the limits of this sample, higher daily social media use was associated with " +
            "slightly lower academic performance. The strength of the association does not support " +
            "treating usage duration as a principal determinant of academic outcomes.",
        },
        {
          number: "5.3",
          title: "Recommendations",
          content:
            "1. Academic advisers should discuss purpose of use, not only duration.\n" +
            "2. Departments should consider consolidating official communication onto fewer platforms.\n" +
            "3. Students should be encouraged to track their own study hours alongside usage.",
        },
        {
          number: "5.4",
          title: "Suggestions for Further Research",
          content:
            "Further work should draw academic performance from official records rather than self " +
            "report, cover multiple institutions, and distinguish academic from recreational use.",
        },
      ],
    },
  ],

  references: [
    {
      authors: ["Katz, E.", "Blumler, J. G.", "Gurevitch, M."],
      year: "1973",
      title: "Uses and Gratifications Research",
      publication: "The Public Opinion Quarterly",
      volume: "37",
      issue: "4",
      pages: "509–523",
    },
  ],
} as const;
