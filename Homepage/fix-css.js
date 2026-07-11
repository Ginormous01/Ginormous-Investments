const fs = require('fs');
let css = fs.readFileSync('Homepage/style.css', 'utf8');

// Remove the duplicate "Enhanced Sidebar" block
const startMarker = '  /* Enhanced Sidebar */';
const endMarker = '  /* Dashboard Grid Enhancement */';

const startIndex = css.indexOf(startMarker);
const endIndex = css.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
  css = css.substring(0, startIndex) + css.substring(endIndex);
  fs.writeFileSync('Homepage/style.css', css);
  console.log('Successfully removed duplicate sidebar CSS block');
} else {
  console.log('Could not find the duplicate block');
}