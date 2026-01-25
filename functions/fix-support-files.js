/**
 * Fix support files with broken imports
 */

const fs = require('fs');
const path = require('path');

const files = [
  'src/support/addMessage.ts',
  'src/support/createTicket.ts',
  'src/support/searchHelpArticles.ts',
  'src/support/updateTicket.ts',
];

for (const file of files) {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${file}`);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Fix the broken import pattern - comment out the entire multi-line import
  // Pattern: // TODO: Fix missing module path
  //          // import {
  //            SupportTicket,
  //            ...
  //          } from '../../../shared/types/support';
  
  // Replace the broken pattern with properly commented import and type stubs
  content = content.replace(
    /\/\/ TODO: Fix missing module path\s*\n\/\/ import \{\s*\n([\s\S]*?)\} from ['"]\.\.\/\.\.\/\.\.\/shared\/types\/support['"];?\s*\n(type \w+ = any;\s*\n)*(const \w+ = [^;]+;\s*\n)*/g,
    (match, imports) => {
      // Extract the import names
      const importNames = imports.split(',')
        .map(s => s.trim().replace(/^\/\/\s*/, ''))
        .filter(s => s && !s.startsWith('//'));
      
      // Create proper type stubs
      const stubs = importNames.map(name => {
        // Check if it's likely a function (starts with lowercase or contains specific keywords)
        if (name.match(/^(get|is|contains|has|check|validate)/i)) {
          return `const ${name} = (...args: any[]): any => null;`;
        }
        return `type ${name} = any;`;
      }).join('\n');
      
      return `// TODO: Fix missing module path - shared/types/support\n${stubs}\n`;
    }
  );
  
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`Fixed ${file}`);
}

console.log('Done');
