@echo off
"C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.8.9-hotspot\\bin\\java" ^
  --class-path ^
  "C:\\Users\\Drink\\.gradle\\caches\\modules-2\\files-2.1\\com.google.prefab\\cli\\2.1.0\\aa32fec809c44fa531f01dcfb739b5b3304d3050\\cli-2.1.0-all.jar" ^
  com.google.prefab.cli.AppKt ^
  --build-system ^
  cmake ^
  --platform ^
  android ^
  --abi ^
  x86_64 ^
  --os-version ^
  24 ^
  --stl ^
  c++_shared ^
  --ndk-version ^
  27 ^
  --output ^
  "C:\\Users\\Drink\\AppData\\Local\\Temp\\agp-prefab-staging8070488135210645580\\staged-cli-output" ^
  "C:\\Users\\Drink\\.gradle\\caches\\8.14.3\\transforms\\3f070ff3b5e25a97fad1b7cc961e77af\\transformed\\react-android-0.81.5-debug\\prefab" ^
  "C:\\Users\\Drink\\.gradle\\caches\\8.14.3\\transforms\\5255993905c89baba10f15b91b9f9c3a\\transformed\\fbjni-0.7.0\\prefab"
