export const SECTION_TITLES: Record<string, string> = {
  A1: 'Eligibility Requirements',
  A2: 'Admission Requirements',
  A3: 'Personnel Requirements',
  B1: 'Program Organization',
  B2: 'Curriculum',
  B3: 'Clinical Education',
  B4: 'Student Services',
  C1: 'Student Progress',
  C2: 'Fair Practices',
  C3: 'Resources',
  C4: 'Provisional Standards',
  D1: 'Self-Study',
  D2: 'Ongoing Review',
  E1: 'Program and Sponsoring Institution Responsibilities',
};

export const SECTION_GROUPS: Record<string, { title: string; sections: string[] }> = {
  A: { title: 'Section A — Program Sponsorship & Resources', sections: ['A1', 'A2', 'A3'] },
  B: { title: 'Section B — Program Curriculum', sections: ['B1', 'B2', 'B3', 'B4'] },
  C: { title: 'Section C — Evaluation', sections: ['C1', 'C2', 'C3', 'C4'] },
  D: { title: 'Section D — Provisional Accreditation', sections: ['D1', 'D2'] },
  E: { title: 'Section E — Accreditation Maintenance', sections: ['E1'] },
};
