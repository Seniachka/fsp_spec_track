import { Capacitor } from '@capacitor/core'

const isNativePlatform = (): boolean => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

const getPlatform = (): string => {
  try {
    return Capacitor.getPlatform()
  } catch {
    return 'web'
  }
}

/** Режимы ресайза вебвью под клавиатуру — значения enum KeyboardResize плагина. */
export type NativeKeyboardResizeMode = 'body' | 'ionic' | 'native' | 'none'

/**
 * Режим ресайза по умолчанию. Источник истины — capacitor.config.ts
 * (plugins.Keyboard.resize = KeyboardResize.Native); значение продублировано
 * строкой, чтобы экран, временно меняющий режим, знал, куда возвращаться, и
 * чтобы enum плагина не попадал в web-бандл. Меняешь конфиг — поменяй и здесь.
 */
export const DEFAULT_KEYBOARD_RESIZE: NativeKeyboardResizeMode = 'native'

/**
 * Можно ли на этой платформе управлять режимом ресайза вебвью (setResizeMode).
 *
 * Только iOS. На Android метод плагина отвечает unimplemented
 * (android/.../KeyboardPlugin.java, setResizeMode), а вебвью там ужимает сама
 * система: AndroidManifest, windowSoftInputMode="adjustResize" плюс
 * resizeOnFullScreen из capacitor.config.ts. При этом события клавиатуры с
 * высотой Android присылает исправно, поэтому экран, который двигает вёрстку
 * сам, ОБЯЗАН сначала спросить здесь: иначе высота клавиатуры вычтется дважды
 * (вьюпорт уже ужат, а блок сверху ещё и сдвинут) и вёрстка уедет за кромку.
 */
export const isNativeKeyboardResizeControllable = (): boolean =>
  isNativePlatform() && getPlatform() === 'ios'

/** Текущая высота клавиатуры в CSS-пикселях (0 — клавиатура скрыта). */
let keyboardHeight = 0
const heightListeners = new Set<(height: number) => void>()

/**
 * Единственная точка записи высоты: CSS-переменная --keyboard-height на
 * documentElement плюс подписчики. Повторную запись того же значения гасим:
 * события Will/Did приходят парами, а лишняя запись стиля на <html> — это
 * лишний пересчёт стилей всего документа посреди анимации клавиатуры.
 */
const setKeyboardHeight = (raw: number): void => {
  const next = Math.max(0, Math.round(raw))
  if (next === keyboardHeight) return
  keyboardHeight = next
  document.documentElement.style.setProperty('--keyboard-height', `${next}px`)
  heightListeners.forEach((listener) => listener(next))
}

/**
 * Возвращает прокрутку документа в допустимые границы [0, max].
 *
 * Баг WKWebView при Keyboard.resize = native: если фокус уходит из текстового
 * поля прямо в элемент без клавиатуры — readonly-поле SelectDropdown («Грейд»
 * в «Месте работы», «Статус», селекты фильтров), — клавиатура прячется, пока в
 * документе остаётся сфокусированный элемент. Плагин возвращает вебвью полную
 * высоту, а WebKit, удерживая этот элемент на прежнем месте экрана, оставляет
 * прокрутку документа на минус высоту клавиатуры (scrollY = -403 на iPhone 17
 * Pro). Документ у нас сам не прокручивается, поэтому вебвью обратно не
 * «отпружинивает»: картинка остаётся сдвинутой, а касания считаются по другим
 * координатам — мимо пунктов списка, в подложку шторки и подтверждения.
 * Снаружи это белый экран со шторкой, из которой не выйти до перезапуска.
 * Через «Готово» на панели над клавиатурой фокус снимается раньше, сдвига нет.
 *
 * Прокрутку в допустимых границах не трогаем, поэтому экраны, которые листают
 * сам документ (/legal/:docId, /support, /download), это не задевает.
 */
const clampDocumentScroll = (): void => {
  const root = document.scrollingElement ?? document.documentElement
  const maxY = Math.max(0, root.scrollHeight - window.innerHeight)
  const y = window.scrollY
  if (y >= 0 && y <= maxY) return
  window.scrollTo(window.scrollX, Math.min(Math.max(y, 0), maxY))
}

/**
 * Клавиатура прячется: от keyboardWillHide до keyboardDidHide (или до нового
 * keyboardWillShow). Сдвиг WebKit ставит сразу, как только плагин вернул
 * вебвью высоту, а keyboardDidHide приходит лишь в конце анимации клавиатуры.
 * Если ждать его, страница успевает мигнуть сдвинутой, поэтому в этом окне
 * прокрутку чиним прямо по scroll документа, а на keyboardDidHide — ещё раз,
 * страховкой. На Android сдвига не бывает, там проверка просто ничего не делает.
 */
let keyboardHiding = false

/** Текущая высота клавиатуры — для первичного расчёта при монтировании экрана. */
export const getNativeKeyboardHeight = (): number => keyboardHeight

/**
 * Подписка на изменение высоты клавиатуры. Возвращает функцию отписки.
 * На web не вызывается ни разу (событий нет) — экран остаётся в исходном виде.
 */
export const subscribeNativeKeyboardHeight = (
  listener: (height: number) => void,
): (() => void) => {
  heightListeners.add(listener)
  return () => {
    heightListeners.delete(listener)
  }
}

/**
 * Настройка нативной клавиатуры. Вызывается один раз на старте приложения.
 *
 * Плагин уже настроен конфигом (capacitor.config.ts, Keyboard.resize = native):
 * при показе клавиатуры WKWebView становится ниже, поэтому 100dvh (и через него
 * --app-vh) равны видимой области, а вёрстка, прибитая к низу оболочки, сама
 * встаёт над клавиатурой. Здесь остаётся то, что конфигом не задаётся.
 *
 * Скролл вебвью здесь НЕ отключаем: Keyboard.setScroll({ isDisabled: true })
 * гасит скролл всего WKWebView на всё время жизни приложения, а часть экранов
 * (/legal/:docId, /support, /download) скроллит именно документ — они бы
 * замерли на первом экране. Экран входа выключает скролл сам, на время своей
 * жизни, через setNativeKeyboardScroll (см. OnboardingAuthPage).
 *
 * Импорт плагина динамический: на web (dev-сервер, превью в браузере)
 * @capacitor/keyboard не нужен и в бандл входить не должен.
 */
export const setupNativeKeyboard = (): void => {
  if (!isNativePlatform()) return

  void (async () => {
    try {
      const { Keyboard } = await import('@capacitor/keyboard')

      if (getPlatform() === 'ios') {
        // Плагин при загрузке безусловно ставит hideFormAccessoryBar = YES
        // (ios/.../Keyboard.m, метод load), то есть панель со стрелками ↑↓ и
        // «Готово» пропадает во всём приложении. Нам она нужна — возвращаем
        // явно. Чтобы наоборот убрать панель, поменять на isVisible: false.
        await Keyboard.setAccessoryBarVisible({ isVisible: true })
      }

      // Высота клавиатуры в CSS-переменной --keyboard-height.
      // Ведущие события — Will*: они приходят ДО начала нативной анимации
      // клавиатуры, поэтому экран входа успевает запустить свой transform в ту
      // же четверть секунды и едет вместе с клавиатурой, а не после неё.
      // Did* оставлены страховкой (интерактивный свайп-дисмисс может отмениться,
      // высота меняется при смене раскладки/эмодзи); одинаковое значение
      // setKeyboardHeight отбрасывает сам.
      await Keyboard.addListener('keyboardWillShow', (info) => {
        keyboardHiding = false
        setKeyboardHeight(info.keyboardHeight)
      })
      await Keyboard.addListener('keyboardDidShow', (info) => setKeyboardHeight(info.keyboardHeight))
      await Keyboard.addListener('keyboardWillHide', () => {
        keyboardHiding = true
        setKeyboardHeight(0)
      })
      await Keyboard.addListener('keyboardDidHide', () => {
        keyboardHiding = false
        setKeyboardHeight(0)
        clampDocumentScroll()
      })

      // Сдвиг документа после скрытия клавиатуры — см. clampDocumentScroll и
      // keyboardHiding. Scroll элементов до window не всплывает, сюда приходит
      // только прокрутка самого документа.
      window.addEventListener(
        'scroll',
        () => {
          if (keyboardHiding) clampDocumentScroll()
        },
        { passive: true },
      )
    } catch {
      // Плагин не поставлен в нативном проекте или упал — экраны должны
      // работать и без него.
    }
  })()
}

/**
 * Очередь вызовов плагина: включение/выключение скролла и смена режима ресайза
 * не должны прийти в обратном порядке (маунт/размонтирование экранов
 * перекрываются, а каждый вызов — асинхронный мост в нативку).
 */
let keyboardQueue: Promise<void> = Promise.resolve()

/**
 * Включает/выключает скролл главного WKWebView (iOS).
 *
 * Нужно ровно одному экрану — входу: WKWebView сам скроллит документ к
 * сфокусированному полю (autofocus вызывается с preventScroll: true, но
 * нативный скролл это не отменяет), из-за чего страница «уезжала» вверх.
 * Вызывать ТОЛЬКО парно: выключил на входе экрана — включи обратно при уходе,
 * иначе замрут экраны с документным скроллом (юрдокументы, поддержка).
 */
export const setNativeKeyboardScroll = (options: { isDisabled: boolean }): void => {
  if (!isNativePlatform() || getPlatform() !== 'ios') return

  keyboardQueue = keyboardQueue.then(async () => {
    try {
      const { Keyboard } = await import('@capacitor/keyboard')
      await Keyboard.setScroll({ isDisabled: options.isDisabled })
    } catch {
      // Плагина нет — скролл вебвью остаётся штатным.
    }
  })
}

/**
 * Меняет режим ресайза вебвью под клавиатуру на лету (iOS; на Android и web —
 * пустышка, там setResizeMode не поддерживается).
 *
 * Нужно экрану входа: в режиме 'none' вебвью НЕ ужимается, вьюпорт остаётся
 * прежним, никакого reflow и мгновенного перескока вёрстки при показе
 * клавиатуры нет — экран сам плавно сдвигает свой блок по --keyboard-height.
 * Вызывать парно: поставил 'none' на маунте — верни DEFAULT_KEYBOARD_RESIZE
 * при размонтировании, иначе остальные экраны потеряют ресайз и их нижние
 * кнопки уедут под клавиатуру.
 *
 * ВАЖНО: плагин только запоминает режим (ios/.../Keyboard.m, setResizeMode —
 * присваивание + resolve), кадр вебвью он при этом не пересчитывает, а ветки
 * ResizeNone в _updateFrame нет вовсе. Поэтому переключаться в 'none', пока
 * клавиатура ВИДНА, нельзя: кадр уже ужат, а восстановить его при скрытии
 * будет некому — вебвью останется коротким. Ждать нулевой высоты обязан
 * вызывающий (см. OnboardingAuthPage).
 */
export const setNativeKeyboardResize = (mode: NativeKeyboardResizeMode): void => {
  if (!isNativeKeyboardResizeControllable()) return

  keyboardQueue = keyboardQueue.then(async () => {
    try {
      const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard')
      const modes = {
        body: KeyboardResize.Body,
        ionic: KeyboardResize.Ionic,
        native: KeyboardResize.Native,
        none: KeyboardResize.None,
      }
      await Keyboard.setResizeMode({ mode: modes[mode] })
    } catch {
      // Плагина нет — остаётся режим из capacitor.config.ts.
    }
  })
}
