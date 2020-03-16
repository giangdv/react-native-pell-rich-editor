import React, { Component } from "react";
import { WebView } from "react-native-webview";
import { actions, messages } from "./const";
import {
  Dimensions,
  PixelRatio,
  Platform,
  StyleSheet,
  View
} from "react-native";
import { HTML } from "./editor";

const PlatformIOS = Platform.OS === "ios";

type Props = {
  style?: object,
  backgroundColor: string,
  color: string,
  minHeight: number,
  onHeightChange: () => void
};

export default class RichTextEditor extends Component<Props> {
  static defaultProps = {
    contentInset: {},
    style: {},
    backgroundColor: "#FFF",
    color: "#000",
    minHeight: 200,
    onHeightChange: () => {}
  };

  constructor(props) {
    super(props);
    this._sendAction = this._sendAction.bind(this);
    this.registerToolbar = this.registerToolbar.bind(this);
    this._onKeyboardWillShow = this._onKeyboardWillShow.bind(this);
    this._onKeyboardWillHide = this._onKeyboardWillHide.bind(this);
    this.state = {
      selectionChangeListeners: [],
      keyboardHeight: 0,
      height: 0,
      isInit: false
    };
    this.focusListeners = [];
    let { backgroundColor, color } = this.props;
    this.html = HTML.replace("{editorBackgroundColor}", backgroundColor);
    this.html = this.html.replace("{editorTextColor}", color);
  }

  componentWillMount() {
    // if (PlatformIOS) {
    //     this.keyboardEventListeners = [
    //         Keyboard.addListener('keyboardWillShow', this._onKeyboardWillShow),
    //         Keyboard.addListener('keyboardWillHide', this._onKeyboardWillHide)
    //     ];
    // } else {
    //     this.keyboardEventListeners = [
    //         Keyboard.addListener('keyboardDidShow', this._onKeyboardWillShow),
    //         Keyboard.addListener('keyboardDidHide', this._onKeyboardWillHide)
    //     ];
    // }
  }

  componentWillUnmount() {
    this.intervalHeight && clearInterval(this.intervalHeight);
    // this.keyboardEventListeners.forEach((eventListener) => eventListener.remove());
  }

  _onKeyboardWillShow(event) {
    // console.log('!!!!', event);
    const newKeyboardHeight = event.endCoordinates.height;
    if (this.state.keyboardHeight === newKeyboardHeight) {
      return;
    }
    if (newKeyboardHeight) {
      this.setEditorAvailableHeightBasedOnKeyboardHeight(newKeyboardHeight);
    }
    this.setState({ keyboardHeight: newKeyboardHeight });
  }

  _onKeyboardWillHide(event) {
    this.setState({ keyboardHeight: 0 });
  }

  setEditorAvailableHeightBasedOnKeyboardHeight(keyboardHeight) {
    const { top = 0, bottom = 0 } = this.props.contentInset;
    const { marginTop = 0, marginBottom = 0 } = this.props.style;
    const spacing = marginTop + marginBottom + top + bottom;

    const editorAvailableHeight =
      Dimensions.get("window").height - keyboardHeight - spacing;
    // this.setEditorHeight(editorAvailableHeight);
  }

  onMessage = event => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      switch (message.type) {
        case messages.CONTENT_HTML_RESPONSE:
          if (this.contentResolve) {
            this.contentResolve(message.data);
            this.contentResolve = undefined;
            this.contentReject = undefined;
            if (this.pendingContentHtml) {
              clearTimeout(this.pendingContentHtml);
              this.pendingContentHtml = undefined;
            }
          }
          break;
        case messages.LOG:
          console.log("FROM EDIT:", ...message.data);
          break;
        case messages.SELECTION_CHANGE: {
          const items = message.data;
          this.state.selectionChangeListeners.map(listener => {
            listener(items);
          });
          break;
        }
        case messages.CONTENT_FOCUSED: {
          this.focusListeners.map(da => da());
          break;
        }
        case messages.OFFSET_HEIGHT:
          this.setWebHeight(message.data);
          if (this.props.onHeightChange) this.props.onHeightChange();
          break;
      }
    } catch (e) {
      //alert('NON JSON MESSAGE');
    }
  };

  setWebHeight = height => {
    if (height !== this.state.height) {
      this.setState({ height });
    }
  };

  renderWebView = () => (
    <WebView
      useWebKit={true}
      scrollEnabled={false}
      {...this.props}
      style={this.state.isInit ? this.props.style : styles.hidden}
      hideKeyboardAccessoryView={true}
      keyboardDisplayRequiresUserAction={false}
      ref={r => {
        this.webviewBridge = r;
      }}
      onMessage={this.onMessage}
      originWhitelist={["*"]}
      dataDetectorTypes={"none"}
      domStorageEnabled={false}
      bounces={false}
      javaScriptEnabled={true}
      source={{ html: this.html }}
      onLoad={() => this.init()}
    />
  );

  render() {
    let { height } = this.state;

    // useContainer is an optional prop with default value of true
    // If set to true, it will use a View wrapper with styles and height.
    // If set to false, it will not use a View wrapper
    const { useContainer = true } = this.props;

    if (useContainer) {
      return (
        <View
          style={[this.props.style, { height: height || this.props.minHeight }]}
        >
          {this.renderWebView()}
        </View>
      );
    }
    return this.renderWebView();
  }

  _sendAction(type, action, data) {
    let jsonString = JSON.stringify({ type, name: action, data });
    if (this.webviewBridge) {
      this.webviewBridge.postMessage(jsonString);
      // console.log(jsonString)
    }
  }

  //-------------------------------------------------------------------------------
  //--------------- Public API

  registerToolbar(listener) {
    this.setState({
      selectionChangeListeners: [
        ...this.state.selectionChangeListeners,
        listener
      ]
    });
  }

  setContentFocusHandler(listener) {
    this.focusListeners.push(listener);
  }

  setContentHTML(html) {
    this._sendAction(actions.content, "setHtml", html);
  }

  blurContentEditor() {
    this._sendAction(actions.content, "blur");
  }

  focusContentEditor() {
    this._sendAction(actions.content, "focus");
  }

  insertImage(attributes) {
    this._sendAction(actions.insertImage, "result", attributes);
  }

  init() {
    let that = this;
    this.setState({
      isInit: true
    });
    that.setContentHTML(this.props.initialContentHTML);
    that.props.editorInitializedCallback &&
      that.props.editorInitializedCallback();

    this.intervalHeight = setInterval(function() {
      that._sendAction(actions.updateHeight);
    }, 200);
  }

  async getContentHtml() {
    return new Promise((resolve, reject) => {
      this.contentResolve = resolve;
      this.contentReject = reject;
      this._sendAction(actions.content, "postHtml");

      this.pendingContentHtml = setTimeout(() => {
        if (this.contentReject) {
          this.contentReject("timeout");
        }
      }, 5000);
    });
  }
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)"
  },
  innerModal: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    paddingTop: 20,
    paddingBottom: PlatformIOS ? 0 : 20,
    paddingLeft: 20,
    paddingRight: 20,
    alignSelf: "stretch",
    margin: 40,
    borderRadius: PlatformIOS ? 8 : 2
  },
  button: {
    fontSize: 16,
    color: "#4a4a4a",
    textAlign: "center"
  },
  inputWrapper: {
    marginTop: 5,
    marginBottom: 10,
    borderBottomColor: "#4a4a4a",
    borderBottomWidth: PlatformIOS ? 1 / PixelRatio.get() : 0
  },
  inputTitle: {
    color: "#4a4a4a"
  },
  input: {
    height: PlatformIOS ? 20 : 40,
    paddingTop: 0
  },
  lineSeparator: {
    height: 1 / PixelRatio.get(),
    backgroundColor: "#d5d5d5",
    marginLeft: -20,
    marginRight: -20,
    marginTop: 20
  },
  hidden: {
    width: 0,
    height: 0
  }
});
