// Dev sketch 1/3 - Qwiic Button I2C detection validation
// Goal: confirm SparkFun Qwiic Button is found on external I2C bus (GPIO 41/42)

#include "Arduino.h"
#include <Wire.h>
#include "HT_SSD1306Wire.h"
#include <SparkFun_Qwiic_Button.h>

SSD1306Wire factory_display(0x3c, 500000, SDA_OLED, SCL_OLED, GEOMETRY_128_64, RST_OLED);
TwoWire I2C_Button = TwoWire(1);
QwiicButton button;

bool lastPressed = false;
unsigned long pressCount = 0;
bool buttonFound = false;

void VextON()  { pinMode(Vext, OUTPUT); digitalWrite(Vext, LOW);  }
void VextOFF() { pinMode(Vext, OUTPUT); digitalWrite(Vext, HIGH); }

void showStatus(const String &l1, const String &l2 = "",
                const String &l3 = "", const String &l4 = "") {
  factory_display.clear();
  factory_display.drawString(0,  0, l1);
  if (l2.length()) factory_display.drawString(0, 16, l2);
  if (l3.length()) factory_display.drawString(0, 32, l3);
  if (l4.length()) factory_display.drawString(0, 48, l4);
  factory_display.display();
}

void scanExternalI2C() {
  Serial.println("Scanning external I2C (GPIO41/42)...");
  for (uint8_t addr = 1; addr < 127; addr++) {
    I2C_Button.beginTransmission(addr);
    if (I2C_Button.endTransmission() == 0) {
      Serial.printf("  Found I2C device at 0x%02X\n", addr);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  VextON();
  delay(100);
  factory_display.init();
  showStatus("Heltec V3 Boot", "OLED OK", "Init external I2C...");

  I2C_Button.begin(41, 42);
  delay(100);
  scanExternalI2C();

  if (button.begin(0x6F, I2C_Button) == false) {
    buttonFound = false;
    showStatus("Qwiic Button", "NOT FOUND", "Check 3.3V GND", "Check SDA41 SCL42");
    Serial.println("Qwiic Button NOT FOUND.");
  } else {
    buttonFound = true;
    showStatus("Qwiic Button", "Connected", "Addr: 0x6F", "Waiting...");
    Serial.println("Qwiic Button connected.");
    delay(1000);
  }
}

void loop() {
  if (!buttonFound) { delay(500); return; }

  bool pressed = button.isPressed();
  if (pressed != lastPressed) {
    lastPressed = pressed;
    if (pressed) {
      pressCount++;
      showStatus("Qwiic Button", "STATE: PRESSED",
                 "Count: " + String(pressCount), "Bus SDA41 SCL42");
    } else {
      showStatus("Qwiic Button", "STATE: RELEASED",
                 "Count: " + String(pressCount), "Waiting...");
    }
  }
  delay(50);
}
