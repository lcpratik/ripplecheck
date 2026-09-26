export interface MigrationInput {
  table: string;
  column: string;
  changeType: "rename" | "drop";
  newName?: string;
  columnType?: string;
  dependentFunctions?: string[];
}

export interface MigrationResult {
  up: string;
  down: string;
  warnings: string[];
}

export function generateMigration(input: MigrationInput): MigrationResult {
  const { table, column, changeType, newName, columnType, dependentFunctions } =
    input;

  const warnings: string[] = [];

  // Warning present for both change types.
  const fnList =
    dependentFunctions && dependentFunctions.length > 0
      ? ` Affected functions/triggers: ${dependentFunctions.join(", ")}.`
      : "";
  warnings.push(
    "PostgreSQL does not update PL/pgSQL function bodies when a column is renamed or " +
      "dropped. Every function or trigger function that references this column must be " +
      "recreated with CREATE OR REPLACE FUNCTION in the same migration." +
      fnList
  );

  if (changeType === "rename") {
    if (!newName) {
      throw new Error("newName is required for changeType 'rename'.");
    }

    const up = `ALTER TABLE ${table} RENAME COLUMN ${column} TO ${newName};`;
    const down = `ALTER TABLE ${table} RENAME COLUMN ${newName} TO ${column};`;

    return { up, down, warnings };
  }

  // changeType === "drop"
  warnings.push(
    "WARNING: DROP COLUMN permanently deletes all data in this column. " +
      "The DOWN migration adds the column back but CANNOT restore the data."
  );

  const up = `ALTER TABLE ${table} DROP COLUMN ${column};`;

  let down: string;
  if (columnType) {
    down = `ALTER TABLE ${table} ADD COLUMN ${column} ${columnType};`;
  } else {
    down =
      `-- WARNING: original column type is unknown; fill in the type before running.\n` +
      `ALTER TABLE ${table} ADD COLUMN ${column} <type>;`;
  }

  return { up, down, warnings };
}
