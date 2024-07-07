<?php

$map = [
  "bd" => "/home/temp/Documents/backup/"
];

$path = array_filter(explode('/', $_SERVER['PATH_INFO']));
$base = array_shift($path);
if(!isset($map[$base]) || in_array('..',$path)){
  http_response_code(404);
  die();
}
$type = array_pop($path);
$path = $map[$base].'/'.implode('/',$path);

function file_info($path){
  $stat = @stat($path);
  if(!$stat) return null;
  $type = null;
  if($stat['mode']&0040000) $type="directory";
  else if($stat['mode']&0100000) $type="file";
  if(!$type) return null;
  $info = [
    "type" => $type,
    "inode" => $stat['ino'],
  ];
  switch($type){
    case "file": {
      $info["size"] = $stat['size'];
      if($info["size"] <= 256)
        $info['content'] = base64_encode(file_get_contents($path));
    } break;
  }
  return $info;
}

$info = file_info($path);
if(!$info){
  // Doesn't exist or not file or directory
  http_response_code(404);
  die();
}

switch($info['type']){
  case "directory": {
    $files = [];
    foreach(scandir($path) as $file){
      if($file == '.' || $file == '..')
        continue;
      $files[$file] = file_info("$path/$file");
    }
    $info['content'] = $files;
  } break;
}

header("application/json");
echo json_encode($info);
