/**
 * Avalo Database Migration Tool
 * Validates Firestore schema and creates indexes
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

interface SchemaField {
  type: string;
  required?: boolean;
  default?: any;
  enum?: string[];
  items?: { type: string };
  fields?: Record<string, SchemaField>;
}

interface SchemaCollection {
  description: string;
  fields: Record<string, SchemaField>;
  indexes: Array<{
    fields: string[];
    unique?: boolean;
  }>;
}

interface Schema {
  collections: Record<string, SchemaCollection>;
}

class MigrationTool {
  private db: admin.firestore.Firestore;
  private schema: Schema;

  constructor() {
    // Initialize Firebase Admin
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    this.db = admin.firestore();
    
    // Load schema
    const schemaPath = path.join(__dirname, 'schema.json');
    this.schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  }

  /**
   * Run all migrations
   */
  async migrate(): Promise<void> {
    console.log('🚀 Starting Avalo Database Migration...\n');

    await this.validateCollections();
    await this.createIndexes();
    await this.generateIndexYaml();
    await this.validateRules();

    console.log('\n✅ Migration completed successfully!');
  }

  /**
   * Validate collections against schema
   */
  private async validateCollections(): Promise<void> {
    console.log('📋 Validating collections...');

    for (const [collectionName, collectionSchema] of Object.entries(this.schema.collections)) {
      console.log(`  Checking collection: ${collectionName}`);

      const snapshot = await this.db.collection(collectionName).limit(10).get();
      
      if (snapshot.empty) {
        console.log(`    ⚠️  Collection is empty`);
        continue;
      }

      const missingFields: Set<string> = new Set();
      let totalDocs = 0;

      snapshot.forEach(doc => {
        totalDocs++;
        const data = doc.data();
        
        // Check for missing required fields
        for (const [fieldName, fieldDef] of Object.entries(collectionSchema.fields)) {
          if (fieldDef.required && !(fieldName in data)) {
            missingFields.add(fieldName);
          }
        }
      });

      if (missingFields.size > 0) {
        console.log(`    ❌ Missing required fields: ${Array.from(missingFields).join(', ')}`);
        console.log(`       Run: npm run migrate:fix --collection=${collectionName}`);
      } else {
        console.log(`    ✅ All required fields present`);
      }
    }
  }

  /**
   * Create indexes
   */
  private async createIndexes(): Promise<void> {
    console.log('\n📑 Creating indexes...');

    for (const [collectionName, collectionSchema] of Object.entries(this.schema.collections)) {
      console.log(`  Collection: ${collectionName}`);

      for (const index of collectionSchema.indexes) {
        const indexDesc = index.fields.join(', ');
        const unique = index.unique ? ' (unique)' : '';
        console.log(`    Creating index: ${indexDesc}${unique}`);
        
        // Note: Firestore indexes must be created via Firebase Console or index.yaml
        // This logs what needs to be created
      }
    }

    console.log('\n  Note: Indexes must be created via firestore.indexes.json or Firebase Console');
  }

  /**
   * Generate index.yaml file
   */
  private async generateIndexYaml(): Promise<void> {
    console.log('\n📝 Generating firestore.indexes.json...');

    const indexes: any[] = [];

    for (const [collectionName, collectionSchema] of Object.entries(this.schema.collections)) {
      for (const index of collectionSchema.indexes) {
        if (index.fields.length > 1) {
          indexes.push({
            collectionGroup: collectionName,
            queryScope: 'COLLECTION',
            fields: index.fields.map(field => ({
              fieldPath: field,
              order: 'ASCENDING',
            })),
          });
        }
      }
    }

    const indexesFile = {
      indexes,
      fieldOverrides: [],
    };

    const outputPath = path.join(__dirname, '..', 'firestore.indexes.json');
    fs.writeFileSync(outputPath, JSON.stringify(indexesFile, null, 2));
    
    console.log(`  ✅ Generated: ${outputPath}`);
    console.log(`     Run: firebase deploy --only firestore:indexes`);
  }

  /**
   * Validate security rules
   */
  private async validateRules(): Promise<void> {
    console.log('\n🔒 Validating security rules...');

    const rulesPath = path.join(__dirname, '..', 'firestore.rules');
    
    if (!fs.existsSync(rulesPath)) {
      console.log('  ⚠️  firestore.rules not found');
      return;
    }

    const rules = fs.readFileSync(rulesPath, 'utf8');

    // Check that all collections have rules
    for (const collectionName of Object.keys(this.schema.collections)) {
      if (rules.includes(`/databases/{database}/documents/${collectionName}`)) {
        console.log(`  ✅ Rules exist for: ${collectionName}`);
      } else {
        console.log(`  ⚠️  No rules found for: ${collectionName}`);
      }
    }
  }

  /**
   * Fix missing fields in collection
   */
  async fixCollection(collectionName: string): Promise<void> {
    console.log(`\n🔧 Fixing collection: ${collectionName}`);

    const collectionSchema = this.schema.collections[collectionName];
    if (!collectionSchema) {
      console.error(`  ❌ Unknown collection: ${collectionName}`);
      return;
    }

    const snapshot = await this.db.collection(collectionName).get();
    let fixedCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const updates: Record<string, any> = {};

      // Add missing fields with defaults
      for (const [fieldName, fieldDef] of Object.entries(collectionSchema.fields)) {
        if (fieldDef.required && !(fieldName in data)) {
          if ('default' in fieldDef) {
            updates[fieldName] = fieldDef.default;
          } else if (fieldDef.type === 'timestamp') {
            updates[fieldName] = admin.firestore.FieldValue.serverTimestamp();
          } else if (fieldDef.type === 'number') {
            updates[fieldName] = 0;
          } else if (fieldDef.type === 'boolean') {
            updates[fieldName] = false;
          } else if (fieldDef.type === 'string') {
            updates[fieldName] = '';
          } else if (fieldDef.type === 'array') {
            updates[fieldName] = [];
          } else if (fieldDef.type === 'object') {
            updates[fieldName] = {};
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await doc.ref.update(updates);
        fixedCount++;
        console.log(`  Fixed: ${doc.id}`);
      }
    }

    console.log(`\n✅ Fixed ${fixedCount} documents in ${collectionName}`);
  }

  /**
   * Validate document against schema
   */
  validateDocument(collectionName: string, data: Record<string, any>): {
    valid: boolean;
    errors: string[];
  } {
    const collectionSchema = this.schema.collections[collectionName];
    if (!collectionSchema) {
      return { valid: false, errors: [`Unknown collection: ${collectionName}`] };
    }

    const errors: string[] = [];

    // Check required fields
    for (const [fieldName, fieldDef] of Object.entries(collectionSchema.fields)) {
      if (fieldDef.required && !(fieldName in data)) {
        errors.push(`Missing required field: ${fieldName}`);
      }

      // Type checking
      if (fieldName in data) {
        const value = data[fieldName];
        const expectedType = fieldDef.type;
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (expectedType !== actualType && value !== null) {
          errors.push(`Field ${fieldName}: expected ${expectedType}, got ${actualType}`);
        }

        // Enum validation
        if (fieldDef.enum && !fieldDef.enum.includes(value)) {
          errors.push(`Field ${fieldName}: value must be one of ${fieldDef.enum.join(', ')}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate TypeScript types from schema
   */
  generateTypes(): void {
    console.log('\n📝 Generating TypeScript types...');

    let output = '/**\n * Auto-generated Firestore types\n * Generated from schema.json\n */\n\n';

    for (const [collectionName, collectionSchema] of Object.entries(this.schema.collections)) {
      const typeName = collectionName.charAt(0).toUpperCase() + collectionName.slice(0, -1);
      output += `export interface ${typeName} {\n`;

      for (const [fieldName, fieldDef] of Object.entries(collectionSchema.fields)) {
        const optional = !fieldDef.required ? '?' : '';
        let tsType = 'any';

        switch (fieldDef.type) {
          case 'string':
            tsType = fieldDef.enum ? fieldDef.enum.map(v => `'${v}'`).join(' | ') : 'string';
            break;
          case 'number':
            tsType = 'number';
            break;
          case 'boolean':
            tsType = 'boolean';
            break;
          case 'timestamp':
            tsType = 'Date | FirebaseFirestore.Timestamp';
            break;
          case 'array':
            tsType = fieldDef.items ? `${fieldDef.items.type}[]` : 'any[]';
            break;
          case 'object':
            tsType = 'Record<string, any>';
            break;
        }

        output += `  ${fieldName}${optional}: ${tsType};\n`;
      }

      output += '}\n\n';
    }

    const outputPath = path.join(__dirname, 'generated-types.ts');
    fs.writeFileSync(outputPath, output);
    console.log(`  ✅ Generated: ${outputPath}`);
  }
}

// CLI
if (require.main === module) {
  const tool = new MigrationTool();
  const command = process.argv[2];
  const collection = process.argv[3];

  (async () => {
    try {
      switch (command) {
        case 'migrate':
          await tool.migrate();
          break;
        case 'fix':
          if (!collection) {
            console.error('Usage: npm run migrate:fix <collection-name>');
            process.exit(1);
          }
          await tool.fixCollection(collection);
          break;
        case 'types':
          tool.generateTypes();
          break;
        default:
          console.log('Usage:');
          console.log('  npm run migrate         - Run full migration');
          console.log('  npm run migrate:fix <collection> - Fix collection');
          console.log('  npm run migrate:types   - Generate TypeScript types');
      }
      process.exit(0);
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  })();
}

export default MigrationTool;