const pool = require('../db/pool');

// The nested requirement spec lives in `definition`; flatten it back out so the
// client sees one object per program rather than a wrapper.
const SELECT = `
  SELECT code, name, catalog_year, total_units, source, source_url, definition
  FROM programs
`;

function shape(row) {
  const { definition, ...scalars } = row;
  return { ...scalars, ...definition };
}

class Program {
  /** Every degree program, EE first. */
  static async getAll() {
    const result = await pool.query(`${SELECT} ORDER BY code DESC`);
    return result.rows.map(shape);
  }

  /** One program by code -- 'EE' or 'CE', case-insensitive. */
  static async getByCode(code) {
    const result = await pool.query(`${SELECT} WHERE upper(code) = upper($1)`, [code]);
    return result.rows[0] ? shape(result.rows[0]) : null;
  }
}

module.exports = Program;
