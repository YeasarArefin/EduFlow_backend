export type CsvImportKind = 'students' | 'teachers';

export type CsvImportRow = {
  rowNumber: number;
  values: Record<string, string>;
  errors: { field: string; reason: string }[];
};
