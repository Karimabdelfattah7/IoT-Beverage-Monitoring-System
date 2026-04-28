#include <RadioLib.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <SparkFun_Qwiic_Button.h>

// ---------------- OLED ----------------
#define OLED_SDA 17
#define OLED_SCL 18
#define OLED_RST 21
Adafruit_SSD1306 display(128, 64, &Wire, OLED_RST);

// ---------------- External I2C for Qwiic Button ----------------
TwoWire I2C_Button = TwoWire(1);
QwiicButton button;

// ---------------- LoRa Radio ----------------
SX1262 radio = new Module(8, 14, 12, 13);

const float FREQUENCY = 915.0;
const float BANDWIDTH = 125.0;
const uint8_t SPREAD_FACTOR = 7;
const uint8_t CODING_RATE = 5;
const uint8_t SYNC_WORD = 0x12;
const int8_t TX_POWER = 10;
const uint16_t PREAMBLE_LEN = 8;

// ---------------- Button timing ----------------
bool buttonFound = false;
bool lastPressed = false;

unsigned long pressStartTime = 0;
unsigned long pressDuration = 0;
unsigned long totalPressTime = 0;
unsigned long pressCount = 0;

// ---------------- Flow rates ----------------
const float SYRUP_RATE_PER_MS = 0.0005f;   // 0.5 oz/sec
const float WATER_RATE_PER_MS = 0.0025f;   // 2.5 oz/sec
const float DRINK_RATE_PER_MS = 0.0030f;   // 3.0 oz/sec

float syrupUsedLastPress = 0.0f;
float waterUsedLastPress = 0.0f;
float drinkUsedLastPress = 0.0f;

float totalSyrupUsed = 0.0f;
float totalWaterUsed = 0.0f;
float totalDrinkUsed = 0.0f;

// ---------------- Helpers ----------------
void showLines(String l1, String l2 = "", String l3 = "", String l4 = "") {
  display.clearDisplay();
  display.setCursor(0, 0);
  display.println(l1);
  if (l2.length()) display.println(l2);
  if (l3.length()) display.println(l3);
  if (l4.length()) display.println(l4);
  display.display();
}

void scanExternalI2C() {
  Serial.println("Scanning external I2C bus on GPIO41/42...");
  for (uint8_t address = 1; address < 127; address++) {
    I2C_Button.beginTransmission(address);
    uint8_t error = I2C_Button.endTransmission(true);
    if (error == 0) {
      Serial.print("Found I2C device at 0x");
      if (address < 16) Serial.print("0");
      Serial.println(address, HEX);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(2000);

  // Heltec display power rail
  pinMode(36, OUTPUT);
  digitalWrite(36, LOW);
  delay(100);

  // OLED
  Wire.begin(OLED_SDA, OLED_SCL);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  showLines("Dispenser Node", "Booting...");

  // Qwiic button on second I2C bus
  I2C_Button.begin(41, 42);
  delay(100);
  scanExternalI2C();

  if (button.begin(0x6F, I2C_Button) == false) {
    buttonFound = false;
    showLines("Dispenser Node", "Qwiic Button", "NOT FOUND");
    while (true) {
      delay(1000);
    }
  } else {
    buttonFound = true;
    showLines("Dispenser Node", "Qwiic Button OK");
    delay(1000);
  }

  // Radio init
  int state = radio.begin(FREQUENCY, BANDWIDTH, SPREAD_FACTOR, CODING_RATE, SYNC_WORD, TX_POWER, PREAMBLE_LEN);

  if (state != RADIOLIB_ERR_NONE) {
    showLines("Dispenser Node", "Radio FAILED");
    while (true) {
      delay(1000);
    }
  }

  radio.setCRC(0);
  radio.setDio2AsRfSwitch(true);

  showLines("Dispenser Node", "Radio OK", "Waiting...");
}

void loop() {
  if (!buttonFound) {
    delay(100);
    return;
  }

  bool pressed = button.isPressed();

  if (pressed && !lastPressed) {
    pressStartTime = millis();
    showLines("Dispenser Node", "BUTTON PRESSED", "Timing...");
    Serial.println("Button pressed");
  }

  if (!pressed && lastPressed) {
    pressDuration = millis() - pressStartTime;
    totalPressTime += pressDuration;
    pressCount++;

    syrupUsedLastPress = pressDuration * SYRUP_RATE_PER_MS;
    waterUsedLastPress = pressDuration * WATER_RATE_PER_MS;
    drinkUsedLastPress = pressDuration * DRINK_RATE_PER_MS;

    totalSyrupUsed += syrupUsedLastPress;
    totalWaterUsed += waterUsedLastPress;
    totalDrinkUsed += drinkUsedLastPress;

    String payload = String("D,")
           + "count=" + String(pressCount)
           + ",duration=" + String(pressDuration) + "i"
           + ",syrup=" + String(syrupUsedLastPress, 3)
           + ",water=" + String(waterUsedLastPress, 3)
           + ",total=" + String(drinkUsedLastPress, 3);

    int state = radio.transmit(payload);

    Serial.print("TX: ");
    Serial.println(payload);

    showLines(
      "Dispenser Node",
      state == RADIOLIB_ERR_NONE ? "Transmission sent" : "Transmission failed",
      "Drink: " + String(drinkUsedLastPress, 2) + " oz",
      "Count: " + String(pressCount)
    );
  }

  lastPressed = pressed;
  delay(10);
}
