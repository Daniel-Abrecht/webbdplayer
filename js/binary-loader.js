
module.exports = function(content){
  // Why do we use raw and then turn it into a string, instead of just using a string?
  // Because otherwise, invalid utf-8 sequences would be replaced with the invalid symbol mark, damaging the file.
  // What this instead does, is turn things like 0xFF into \u00FF, essentially escaping it.
  // All non-ascii characters are escaped like this, so don't expect longer unicode codepoints to stay as is.
  content = atob(content.toString("base64"));
  content = JSON.stringify(content);
  content = "module.exports = new Uint8Array(Array.from(" + content + ", x=>x.charCodeAt(0)));\n";
  return content;
};

module.exports.raw = true;

