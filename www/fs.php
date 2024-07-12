<?php

http_response_code(500);

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

function handle_meta($path){
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
  http_response_code(200);
  header("application/json");
  header("Cache-Control: max-age=604800, stale-if-error=604800, immutable");
  echo json_encode($info);
}

function handle_data($path){
  $file = @fopen($path, "rb");
  if(!$file){
    http_response_code(404);
    die();
  }
  $r = explode(',',@$_GET['r']);
  // The same data may be requested using different overlapping ranges, browser can't handle caching that.
  // Special caching is done client side.
  http_response_code(200);
  header("Cache-Control: no-store");
  header("Content-Type: application/octet-stream");
  $eof = false;
  $ridx = 0;
  foreach($r as &$range){
    $range = explode('-',$range,2);
    if($range[0]==='') $range[0] = 0;
    if(@$range[1]!==0&&!@$range[1]) @$range[1] = 999999999999999999;
    $range[0] = $range[0]|0;
    @$range[1] = @$range[1]|0;
    if(is_nan($range[0]) || is_nan($range[1]) || $range[0] > $range[1] || $range[0] < $ridx){
      http_response_code(400);
      die("Ranges must always increase and not overlap");
    }
    $ridx = $range[1];
  }
  foreach($r as list($from,$to)){
    fseek($file, $from);
    $size = $to-$from;
    while($size>0){
      $s = min($size, 1024*1024);
      $res = fread($file, $s);
      if($res === false || $res === '')
        break;
      echo $res;
      $size -= $s;
    }
  }
  fclose($file);
}

switch($type){
  case 'meta': handle_meta($path); break;
  case 'data': handle_data($path); break;
  default: http_response_code(404); break;
}
