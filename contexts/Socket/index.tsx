/* eslint-disable no-console */
import { createContext, useContext, useEffect } from "react";
import type { IMessage, IStompSocket } from "@stomp/stompjs";
import { Client } from "@stomp/stompjs";
import { useRecoilState } from "recoil";
import SockJS from "sockjs-client";
import { isBrowser } from "~/consts";
import { emojiAtomState } from "~/store/emoji";
import { playlistAtomState, proposedPlaylistAtomState } from "~/store/playlist";
import type { StompCallbackMessage } from "~/types/webSocket";

interface InitialState {
  socket: Client;
}
const SocketContext = createContext({} as InitialState);

interface Props {
  children: React.ReactNode;
}

const STOMP_SERVER_URL = process.env
  .NEXT_PUBLIC_SERVER_STOMP_END_POINT as string;
const ROOM_ID = 1; // XXX: For test
const tokenKey = process.env.NEXT_PUBLIC_LOCAL_TOKEN_KEY as string;
const localStorageToken: string | null = isBrowser
  ? JSON.parse(localStorage.getItem(tokenKey) as string)
  : null;

const socket = new Client();
socket.configure({
  brokerURL: STOMP_SERVER_URL,
  connectHeaders: {
    Authorization: `Bearer ${localStorageToken}`,
    "Content-Type": "application/json",
  },
  debug: (str) => {
    console.debug(new Date(), str);
  },
  reconnectDelay: 5000,
  heartbeatIncoming: 4000,
  heartbeatOutgoing: 4000,
});

// Fallback code
if (typeof WebSocket !== "function") {
  socket.webSocketFactory = () => {
    return new SockJS(STOMP_SERVER_URL) as IStompSocket;
  };
}

const SocketProvider = ({ children }: Props) => {
  const [, setProposedPlaylist] = useRecoilState(proposedPlaylistAtomState);
  const [, setEmoji] = useRecoilState(emojiAtomState);
  const [, setPlaylist] = useRecoilState(playlistAtomState);
  const subscribe = () => {
    socket.subscribe(
      `/topic/v1/rooms/${ROOM_ID}`,
      (message: IMessage) => {
        if (message.body) {
          const newMessage: StompCallbackMessage = JSON.parse(message.body);
          // 메시지 타입에 따라서 상태 다르게 적용하기
          switch (newMessage.type) {
            case "ERROR":
              console.error(newMessage.code, newMessage.message);
              break;
            case "EMOJI":
              setEmoji(newMessage.data);
              break;
            case "PLAYLIST_ITEM_ADD":
              setPlaylist((_playlist) => [..._playlist, newMessage.data]);
              break;
            default:
              console.error("등록되지 않은 메시지 타입입니다.");
              break;
          }
        } else {
          console.error("got empty message");
        }
      },
      { Authorization: `Bearer ${localStorageToken}` }
    );
    socket.subscribe(
      "/user/queue",
      (message: IMessage) => {
        if (message.body) {
          const newMessage: StompCallbackMessage = JSON.parse(message.body);
          // 메시지 타입에 따라서 상태 다르게 적용하기
          switch (newMessage.type) {
            case "ERROR":
              console.error(newMessage.code, newMessage.message);
              break;
            case "PLAYLIST_ITEM_REQUEST":
              setProposedPlaylist((_playlist) => [
                ..._playlist,
                newMessage.data,
              ]);
              break;
            default:
              console.error("등록되지 않은 메시지 타입입니다.");
              break;
          }
        } else {
          console.error("got empty message");
        }
      },
      { Authorization: `Bearer ${localStorageToken}` }
    );
  };

  const connect = () => {
    socket.onConnect = () => {
      console.log("connect!");
      subscribe();
    };

    socket.onStompError = (frame) => {
      console.debug(`Broker reported error: ${frame.headers.message}`);
      console.debug(`Additional details: ${frame.body}`);
    };

    socket.activate();
  };

  const disConnect = () => {
    if (socket.connected) {
      socket.deactivate();
    }
  };

  useEffect(() => {
    connect();

    return () => disConnect();
  }, []);

  return (
    <SocketContext.Provider
      value={{
        socket,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);

export default SocketProvider;
