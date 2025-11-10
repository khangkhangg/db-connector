/**
 * Basic usage examples for DB Schema Mapper Connector
 */

import { DBSchemaMapper, DatabaseType } from '../src';

async function example1_ReadMSSQLSchema() {
  console.log('\n=== Example 1: Read MSSQL Schema ===\n');

  const mapper = new DBSchemaMapper();

  try {
    const schema = await mapper.readLocalSchema(DatabaseType.MSSQL, {
      includeSystemTables: false,
      excludeTables: ['sysdiagrams']
    });

    console.log(`Database: ${schema.databaseName}`);
    console.log(`Tables found: ${schema.tables.length}`);
    console.log(`Server version: ${schema.serverVersion}`);

    // Display first table details
    if (schema.tables.length > 0) {
      const table = schema.tables[0];
      console.log(`\nFirst table: ${table.name}`);
      console.log(`Columns: ${table.columns.length}`);
      console.log(`Primary keys: ${table.primaryKey.join(', ')}`);
      console.log(`Foreign keys: ${table.foreignKeys.length}`);
    }
  } catch (error) {
    console.error('Error reading schema:', error);
  }
}

async function example2_ReadMySQLSchema() {
  console.log('\n=== Example 2: Read MySQL Schema ===\n');

  const mapper = new DBSchemaMapper();

  try {
    const schema = await mapper.readLocalSchema(DatabaseType.MySQL, {
      includeSystemTables: false
    });

    console.log(`Database: ${schema.databaseName}`);
    console.log(`Tables found: ${schema.tables.length}`);

    // List all tables
    schema.tables.forEach(table => {
      console.log(`- ${table.name} (${table.columns.length} columns)`);
    });
  } catch (error) {
    console.error('Error reading schema:', error);
  }
}

async function example3_MapSchema() {
  console.log('\n=== Example 3: Map Schema Between Databases ===\n');

  const mapper = new DBSchemaMapper();

  try {
    // Read from MSSQL
    const mssqlSchema = await mapper.readLocalSchema(DatabaseType.MSSQL);

    console.log('Original schema (MSSQL):');
    console.log(`- Database Type: ${mssqlSchema.databaseType}`);
    console.log(`- Tables: ${mssqlSchema.tables.length}`);

    // Map to MySQL
    const mysqlSchema = mapper.mapSchema(mssqlSchema, DatabaseType.MySQL, {
      preserveCase: false,
      includeConstraints: true,
      includeIndexes: true
    });

    console.log('\nMapped schema (MySQL):');
    console.log(`- Database Type: ${mysqlSchema.databaseType}`);
    console.log(`- Tables: ${mysqlSchema.tables.length}`);

    // Show data type mapping example
    if (mysqlSchema.tables.length > 0) {
      const table = mysqlSchema.tables[0];
      console.log(`\nSample column mappings from ${table.name}:`);
      table.columns.slice(0, 5).forEach(col => {
        console.log(`  ${col.name}: ${col.dataType} (${col.standardType})`);
      });
    }
  } catch (error) {
    console.error('Error mapping schema:', error);
  }
}

async function example4_CompareSchemas() {
  console.log('\n=== Example 4: Compare Schemas ===\n');

  const mapper = new DBSchemaMapper();

  try {
    const schema1 = await mapper.readLocalSchema(DatabaseType.MSSQL);
    const schema2 = await mapper.readLocalSchema(DatabaseType.MySQL);

    const comparison = mapper.compareSchemas(schema1, schema2);

    console.log('Schema Comparison Results:');
    console.log(`- Tables added: ${comparison.tablesAdded.length}`);
    console.log(`- Tables removed: ${comparison.tablesRemoved.length}`);
    console.log(`- Tables modified: ${comparison.tablesModified.length}`);
    console.log(`- Identical: ${comparison.isIdentical}`);

    if (comparison.tablesAdded.length > 0) {
      console.log('\nAdded tables:');
      comparison.tablesAdded.forEach(table => console.log(`  + ${table}`));
    }

    if (comparison.tablesRemoved.length > 0) {
      console.log('\nRemoved tables:');
      comparison.tablesRemoved.forEach(table => console.log(`  - ${table}`));
    }
  } catch (error) {
    console.error('Error comparing schemas:', error);
  }
}

async function example5_GenerateDDL() {
  console.log('\n=== Example 5: Generate DDL Statements ===\n');

  const mapper = new DBSchemaMapper();

  try {
    const schema = await mapper.readLocalSchema(DatabaseType.MSSQL);

    console.log('Generating CREATE TABLE statements...\n');

    const ddlStatements = mapper.generateDDL(schema);

    // Show first DDL statement
    if (ddlStatements.length > 0) {
      console.log('Example DDL:');
      console.log(ddlStatements[0]);
    }

    console.log(`\nTotal DDL statements generated: ${ddlStatements.length}`);
  } catch (error) {
    console.error('Error generating DDL:', error);
  }
}

async function example6_CompleteWorkflow() {
  console.log('\n=== Example 6: Complete Sync Workflow ===\n');

  const mapper = new DBSchemaMapper();

  try {
    console.log('Starting complete sync workflow...');
    console.log('1. Reading local MSSQL schema...');
    console.log('2. Mapping to MySQL format...');
    console.log('3. Syncing to remote application...');

    await mapper.syncLocalToRemote(
      DatabaseType.MSSQL,
      DatabaseType.MySQL,
      {
        includeSystemTables: false,
        excludeTables: ['temp_*', 'audit_*']
      },
      {
        targetDatabaseType: DatabaseType.MySQL,
        preserveCase: false,
        includeConstraints: true,
        includeIndexes: true
      }
    );

    console.log('✓ Sync completed successfully!');
  } catch (error) {
    console.error('Error in sync workflow:', error);
  }
}

// Main execution
async function main() {
  console.log('DB Schema Mapper - Usage Examples');
  console.log('==================================');

  // Uncomment the examples you want to run:

  // await example1_ReadMSSQLSchema();
  // await example2_ReadMySQLSchema();
  // await example3_MapSchema();
  // await example4_CompareSchemas();
  // await example5_GenerateDDL();
  // await example6_CompleteWorkflow();

  console.log('\n✓ Examples completed\n');
}

// Run examples
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export {
  example1_ReadMSSQLSchema,
  example2_ReadMySQLSchema,
  example3_MapSchema,
  example4_CompareSchemas,
  example5_GenerateDDL,
  example6_CompleteWorkflow
};
