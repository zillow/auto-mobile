package dev.jasonpearson.automobile.playground

import android.app.Application
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import dev.jasonpearson.automobile.sdk.network.AutoMobileNetwork
import okhttp3.OkHttpClient

class App : Application(), SingletonImageLoader.Factory {

  override fun newImageLoader(context: coil3.PlatformContext): ImageLoader {
    val clientBuilder = OkHttpClient.Builder()

    // Add AutoMobile network interceptor if available
    AutoMobileNetwork.interceptor()?.let { interceptor ->
      clientBuilder.addInterceptor(interceptor)
    }

    return ImageLoader.Builder(context)
      .components {
        add(OkHttpNetworkFetcherFactory(callFactory = { clientBuilder.build() }))
      }
      .build()
  }
}
