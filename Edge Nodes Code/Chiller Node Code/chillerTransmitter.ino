#include <RadioLib.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_MCP9600.h>

// ---------------- OLED ----------------
#define OLED_SDA 17
#define OLED_SCL 18
#define OLED_RST 21
Adafruit_SSD1306 display(128, 64, &Wire, OLED_RST);

// ---------------- External I2C for MCP9600 ----------------
TwoWire I2C_Temp = TwoWire(1);
Adafruit_MCP9600 mcp;

// ---------------- LoRa Radio ----------------
SX1262 radio = new Module(8, 14, 12, 13);

const float FREQUENCY = 915.0;
const float BANDWIDTH = 125.0;
const uint8_t SPREAD_FACTOR = 7;
const uint8_t CODING_RATE = 5;
const uint8_t SYNC_WORD = 0x12;
const int8_t TX_POWER = 10;
const uint16_t PREAMBLE_LEN = 8;

// ---------------- Chiller config ----------------
bool sensorFound = false;
unsigned long packetCount = 0;
unsigned long lastSend = 0;
const unsigned long SEND_INTERVAL = 10000;

// Optional calibration offset
const float TEMP_OFFSET = 0.0;

// Smoothing
const int NUM_SAMPLES = 5;

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

float readSmoothedTemp() {
  float sum = 0.0;

  for (int i = 0; i < NUM_SAMPLES; i++) {
    float t = mcp.readThermocouple();
    sum += t;
    delay(50);
  }

  float avg = sum / NUM_SAMPLES;
  return avg + TEMP_OFFSET;
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
  showLines("Chiller Node", "Booting...");

  // External I2C for MCP9600
  // Keep the slow clock since this is what worked for you
  I2C_Temp.begin(41, 42, 1000);
  I2C_Temp.setTimeOut(50);
  delay(500);

  // MCP9600 init
  if (!mcp.begin(0x60, &I2C_Temp)) {
    sensorFound = false;
    showLines("Chiller Node", "MCP9600", "NOT FOUND");
    while (true) {
      delay(1000);
    }
  } else {
    sensorFound = true;
    mcp.setADCresolution(MCP9600_ADCRESOLUTION_18);
    mcp.setThermocoupleType(MCP9600_TYPE_K);
    mcp.setFilterCoefficient(3);
    mcp.enable(true);

    showLines("Chiller Node", "MCP9600 OK");
    delay(1000);
  }

  // Radio init
  int state = radio.begin(FREQUENCY, BANDWIDTH, SPREAD_FACTOR, CODING_RATE, SYNC_WORD, TX_POWER, PREAMBLE_LEN);

  if (state != RADIOLIB_ERR_NONE) {
    showLines("Chiller Node", "Radio FAILED");
    while (true) {
      delay(1000);
    }
  }

  radio.setCRC(0);
  radio.setDio2AsRfSwitch(true);

  showLines("Chiller Node", "Radio OK", "Waiting...");
}

void loop() {
  if (!sensorFound) {
    delay(100);
    return;
  }

  if (millis() - lastSend >= SEND_INTERVAL) {
    lastSend = millis();
    packetCount++;

    float ambientC = mcp.readAmbient();
    float tempC = readSmoothedTemp();

    String payload = String("C,")
               + "count=" + String(packetCount)
               + ",temp=" + String(tempC, 2)
               + ",ambient=" + String(ambientC, 2);

    int state = radio.transmit(payload);

    Serial.print("TX: ");
    Serial.println(payload);

    showLines(
      "Chiller Node",
      state == RADIOLIB_ERR_NONE ? "Transmission sent" : "Transmission failed",
      "Temp: " + String(tempC, 2) + " C",
      "Amb: " + String(ambientC, 2) + " C"
    );
  }

  delay(10);
}
