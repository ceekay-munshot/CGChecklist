export const MUNS_API_BASE = "https://birdnest.muns.io";

export const MUNS_USER_INDEX = 124;

export interface GovernanceSection {
  index: number;
  title: string;
  agentLibraryId: string;
}

export const GOVERNANCE_SECTIONS: GovernanceSection[] = [
  {
    index: 1,
    title: "Board of directors",
    agentLibraryId: "022241e5-86c4-492b-a614-43990da3b841",
  },
  {
    index: 2,
    title: "Audit",
    agentLibraryId: "df618c18-0ade-498e-ba18-c7f25acbf87a",
  },
  {
    index: 3,
    title: "Stakeholders",
    agentLibraryId: "8c5187ca-447b-417f-b560-3b9684ffdd0c",
  },
  {
    index: 4,
    title: "Employee",
    agentLibraryId: "465b6afd-90b0-4bc3-8ac8-4f59a80e05f8",
  },
  {
    index: 5,
    title: "Industry and Promoter",
    agentLibraryId: "34c938db-41cb-4406-b358-53e314fed6f8",
  },
  {
    index: 6,
    title: "Stock Exchange",
    agentLibraryId: "bd38310a-46fd-49a2-b973-3f19c37135e7",
  },
  {
    index: 7,
    title: "Other Regulatory",
    agentLibraryId: "a6acebb8-4355-4915-8234-269b2b35ab6b",
  },
  {
    index: 8,
    title: "Financials",
    agentLibraryId: "f77e47d9-7cbb-4bdb-aced-346affe0f2c7",
  },
];

export const GOVERNANCE_PARALLEL_BATCH_SIZE = 4;
