import groovy.json.JsonSlurper

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Wersja aplikacji = wersja wtyczki z manifest.json (np. 1.2.2 → versionCode 10202).
@Suppress("UNCHECKED_CAST")
val extensionVersion = (JsonSlurper().parse(rootProject.file("../manifest.json")) as Map<String, Any>)["version"] as String
val versionParts = extensionVersion.split(".").map { it.toInt() } + listOf(0, 0)
val appVersionCode = versionParts[0] * 10000 + versionParts[1] * 100 + versionParts[2]

// Podpis wydania: plik i hasło z zmiennych środowiskowych (w GitHub Actions – z sekretów repozytorium).
// Bez nich wydanie podpisuje się kluczem debug (do testów; takiej wersji nie da się potem zaktualizować
// wersją podpisaną właściwym kluczem bez odinstalowania).
val releaseKeystore = System.getenv("APEX_KEYSTORE")?.takeIf { it.isNotBlank() && file(it).exists() }
val releaseKeystorePassword = System.getenv("APEX_KEYSTORE_PASSWORD").orEmpty()

android {
    namespace = "app.apexsoftware.unfollowers"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.apexsoftware.unfollowers"
        minSdk = 24
        targetSdk = 35
        versionCode = appVersionCode
        versionName = extensionVersion
    }

    signingConfigs {
        if (releaseKeystore != null) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = releaseKeystorePassword
                keyAlias = System.getenv("APEX_KEY_ALIAS")?.takeIf { it.isNotBlank() } ?: "apex"
                keyPassword = System.getenv("APEX_KEY_PASSWORD")?.takeIf { it.isNotBlank() } ?: releaseKeystorePassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }

    // Bez metadanych zależności w APK (nie są potrzebne poza Google Play).
    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }
}

// Skrypt panelu musi być zbudowany przed aplikacją: npm run mobile (albo node tools/build-mobile.mjs).
val checkBundle by tasks.registering {
    val bundle = file("src/main/assets/apex-unfollowers.js")
    doLast {
        if (!bundle.exists()) {
            throw GradleException("Brak ${bundle.path}. Uruchom najpierw w katalogu repozytorium: npm run mobile")
        }
    }
}
tasks.named("preBuild") { dependsOn(checkBundle) }

dependencies {
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.webkit:webkit:1.12.1")
}
