package com.kungkoipp.mikev1test2

import expo.modules.splashscreen.SplashScreenManager

import android.app.PictureInPictureParams
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.Rational

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    SplashScreenManager.registerOnActivity(this)
    super.onCreate(null)

    // เปิดให้ PiP ได้อัตโนมัติตอนกดปุ่ม Home (Android 12+)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      setPictureInPictureParams(
        PictureInPictureParams.Builder()
          .setAspectRatio(Rational(1, 1))   // ไอคอนสี่เหลี่ยมจัตุรัส
          .setAutoEnterEnabled(true)         // ← กด Home → เข้า PiP อัตโนมัติ
          .build()
      )
    }
  }

  // กด Home / ย่อแอป → เข้า PiP (Android 8+)
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    enterPipIfActive()
  }

  override fun onPictureInPictureModeChanged(
    isInPictureInPictureMode: Boolean,
    newConfig: Configuration
  ) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    // JS จะรับ AppState change ได้ปกติ
  }

  private fun enterPipIfActive() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (isInPictureInPictureMode) return

    try {
      val params = PictureInPictureParams.Builder()
        .setAspectRatio(Rational(1, 1))
        .build()
      enterPictureInPictureMode(params)
    } catch (_: Exception) {
      // มือถือบางรุ่นไม่รองรับ PiP — ไม่ทำอะไร
    }
  }

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
      this,
      BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      object : DefaultReactActivityDelegate(
        this,
        mainComponentName,
        fabricEnabled
      ) {}
    )
  }

  override fun invokeDefaultOnBackPressed() {
    if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
      if (!moveTaskToBack(false)) {
        super.invokeDefaultOnBackPressed()
      }
      return
    }
    super.invokeDefaultOnBackPressed()
  }
}