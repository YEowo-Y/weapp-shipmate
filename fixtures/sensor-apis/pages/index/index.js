// 传感器/设备/隐私 API 锚定夹具：14 条 static_api_call 的 privacy.* 规则各调一个代表 API，
// 补齐 accuracy 语料的召回锚点（此前这批规则零标注，对 precision/recall 完全不可见）。
// 位置类接口（chooseLocation/choosePoi/chooseAddress）已在 app.json 声明——
// consistency.requiredPrivateInfos 在此必须静默（no_hit 反例）。
Page({
  onLoad() {
    wx.saveImageToPhotosAlbum({});        // privacy.writePhotosAlbum
    wx.chooseLocation({});                // privacy.chooseLocation
    wx.chooseAddress({});                 // privacy.chooseAddress
    wx.chooseInvoiceTitle({});            // privacy.chooseInvoice
    wx.openBluetoothAdapter({});          // privacy.bluetooth
    wx.addPhoneContact({});               // privacy.addPhoneContact
    wx.addPhoneCalendar({});              // privacy.addPhoneCalendar
    wx.chooseMessageFile({});             // privacy.chooseFile
    wx.chooseLicensePlate({});            // privacy.chooseLicensePlate
    wx.getWeRunData({});                  // privacy.werun
    wx.startAccelerometer({});            // privacy.accelerometer
    wx.startCompass({});                  // privacy.compass
    wx.startDeviceMotionListening({});    // privacy.deviceMotion
    wx.startGyroscope({});                // privacy.gyroscope
  },
});
