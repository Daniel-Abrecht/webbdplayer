
if(!Array.prototype.at)
  Array.prototype.at = function(i){
    return this[i<0 ? this.length+i : i];
  };
if(!String.prototype.at)
  String.prototype.at = Array.prototype.at;
