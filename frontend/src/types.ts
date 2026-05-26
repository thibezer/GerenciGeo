export interface RouteDef {
  render: () => string;
  setup?: () => void;
  cleanup?: () => void;
}
